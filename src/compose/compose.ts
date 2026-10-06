import { z } from 'zod'
import { fallbackTurn, FALLBACK_NOTE } from './fallback.ts'
import type { Grounding } from './grounding.ts'
import { buildUserContent, systemPromptFor } from './prompt.ts'
import { checkTurnFor, withoutRepeatedQuestion } from './rules.ts'
import { boardTurnSchema } from './boardSpec.ts'
import { invoiceTurnSchema } from './invoiceSpec.ts'
import { TASKS, isBoardAction, isInvoiceAction, modeOf, turnJsonSchema, turnSchema, type AnyTurn, type ComposeRequest, type Mode, type Outcome, type Task, type Turn } from './spec.ts'

// The composition loop: ask the model, check the answer against the workspace, and if it is no good ask once more
// with the reasons. A second failure uses the fixed fallback. Invalid output never reaches the screen.

// `mode` says which model to ask: Quick (base) or Advanced. `search` lets an Advanced request use Google Search, if its model can. The model decides
// whether to. `userWithoutSearch` is the same request telling the model it cannot search, for a model that cannot (Quick, which Advanced falls back to,
// or one the API will not let search), so it never thinks it looked something up.
export type ModelRequest = { system: string; user: string; schema: Record<string, unknown>; mode?: Mode; search?: boolean; userWithoutSearch?: string }

// How many tokens a reply used, as the API counts them. Logged, never shown to founders.
export type Usage = { prompt: number; answer: number; thinking: number }

// What a caller says about how it answered, for the log and for the allowance.
export type ReplyMeta = {
  // The model that answered.
  model: string
  // The mode that really answered. An Advanced request is answered by Quick when Advanced cannot answer.
  answeredBy: Mode
  // Set when an Advanced request was answered by Quick because Google's model had no quota left, or was overloaded. That is Google's doing, not the founder's.
  spared?: boolean
  // Search was asked for and the API refused it, so the model answered without.
  searchRefused?: boolean
  usage?: Usage
}

// The reply as text, and what it searched for and drew on, if it searched.
export type ModelReply = { text: string; grounding?: Grounding; meta?: ReplyMeta }
// Sends one request to the model and returns its reply. The only place a model is called from. A plain string is a reply that searched nothing.
export type ModelCaller = (request: ModelRequest) => Promise<string | ModelReply>

export type ComposeErrorKind = 'no_key' | 'bad_key' | 'bad_model' | 'rate_limited' | 'quota' | 'timeout' | 'unavailable' | 'blocked' | 'bad_request'

// The model could not be reached or refused. This is not a bad answer, so it is not retried or covered by the fallback.
export class ComposeError extends Error {
  kind: ComposeErrorKind
  // For a used-up quota: how long until it resets, when the API says.
  retryAfterSeconds?: number
  constructor(kind: ComposeErrorKind, message: string, retryAfterSeconds?: number) {
    super(message)
    this.name = 'ComposeError'
    this.kind = kind
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export type Attempt = { errors: string[] }

export type ComposeResult = {
  outcome: Outcome
  turn: AnyTurn
  note?: string
  attempts: Attempt[]
  // What the accepted reply searched for and drew on, if it searched.
  grounding?: Grounding
  // How many of the replies asked for searched the web (a retry can search too).
  searches: number
  // How the model answered, when the caller says (the last reply's), with the tokens of every reply added up.
  meta?: ReplyMeta
}

const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/i

function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : 'reply'}: ${issue.message}`)
}

// What a reply is checked against: the request it answers, which says which workspace was on screen and what it held.
type Asked = Pick<ComposeRequest, 'intent' | 'history' | 'view' | 'workspace' | 'invoice' | 'board'>

// One reply, checked: it must parse, match the schema, and pass the business rules for the workspace it was meant for.
export function checkReply(text: string, asked: Partial<Asked> = {}): { turn?: AnyTurn; errors: string[]; task?: Task } {
  let data: unknown
  try {
    data = JSON.parse(text.trim().replace(FENCE, '$1'))
  } catch {
    return { errors: ['The reply was not valid JSON. Reply with only the JSON object.'] }
  }

  const taskGuess = (data as { task?: unknown } | null)?.task
  const task = TASKS.find((candidate) => candidate === taskGuess)

  const parsed = (asked.view === 'invoice' ? invoiceTurnSchema : asked.view === 'board' ? boardTurnSchema : turnSchema).safeParse(data)
  if (!parsed.success) return { errors: describeIssues(parsed.error), task }

  const errors = checkTurnFor(parsed.data, { intent: '', ...asked })
  if (errors.length > 0) return { errors, task: parsed.data.task }
  return { turn: withoutRepeatedQuestion(normalise(parsed.data)), errors: [], task: parsed.data.task }
}

// Hex values are stored the same way everywhere: six digits, upper case.
function normalise(turn: AnyTurn): AnyTurn {
  // Invoice and board actions hold no colours, so there is nothing to tidy.
  if (turn.actions.some(isInvoiceAction) || turn.actions.some(isBoardAction)) return turn
  const brand = turn as Turn
  return {
    ...brand,
    actions: brand.actions.map((action) => {
      if (action.type === 'set_palette') return { ...action, colours: action.colours.map((c) => ({ ...c, hex: c.hex.toUpperCase() })) }
      if (action.type === 'set_colour' || action.type === 'add_colour') return { ...action, hex: action.hex.toUpperCase() }
      return action
    }),
  }
}

export async function composeWorkspace(request: ComposeRequest, call: ModelCaller): Promise<ComposeResult> {
  const mode = modeOf(request)
  const schema = turnJsonSchema(request.view)
  const system = systemPromptFor(request.view, mode)
  // Quick never searches. Advanced may, and the model decides whether to.
  const search = mode === 'advanced'
  const attempts: Attempt[] = []
  let errors: string[] = []
  let task: Task | undefined
  let searches = 0
  let meta: ReplyMeta | undefined
  const usage: Usage = { prompt: 0, answer: 0, thinking: 0 }
  let counted = false

  const resultMeta = (): ReplyMeta | undefined => (meta ? { ...meta, ...(counted ? { usage: { ...usage } } : {}) } : undefined)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sent = attempt === 0 ? undefined : errors
    const raw = await call({
      system,
      user: buildUserContent(request, sent, search),
      schema,
      mode,
      ...(search ? { search, userWithoutSearch: buildUserContent(request, sent, false) } : {}),
    })
    const reply: ModelReply = typeof raw === 'string' ? { text: raw } : raw
    if (reply.grounding) searches += 1
    if (reply.meta) {
      meta = { ...reply.meta, searchRefused: Boolean(meta?.searchRefused || reply.meta.searchRefused) || undefined }
      if (reply.meta.usage) {
        counted = true
        usage.prompt += reply.meta.usage.prompt
        usage.answer += reply.meta.usage.answer
        usage.thinking += reply.meta.usage.thinking
      }
    }
    const checked = checkReply(reply.text, request)
    attempts.push({ errors: checked.errors })
    if (checked.turn) {
      return { outcome: attempt === 0 ? 'valid' : 'retried', turn: checked.turn, attempts, searches, ...(reply.grounding ? { grounding: reply.grounding } : {}), ...(meta ? { meta: resultMeta() } : {}) }
    }
    errors = checked.errors
    task = checked.task ?? task
  }

  return { outcome: 'fallback', turn: fallbackTurn(task, Boolean(request.workspace ?? request.invoice ?? request.board)), note: FALLBACK_NOTE, attempts, searches, ...(meta ? { meta: resultMeta() } : {}) }
}
