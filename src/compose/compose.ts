import { z } from 'zod'
import { fallbackTurn, FALLBACK_NOTE } from './fallback.ts'
import { buildUserContent, systemPromptFor } from './prompt.ts'
import { checkTurnFor } from './rules.ts'
import { invoiceTurnSchema } from './invoiceSpec.ts'
import { TASKS, isInvoiceAction, turnJsonSchema, turnSchema, type AnyTurn, type ComposeRequest, type Outcome, type Task, type Turn } from './spec.ts'

// The composition loop: ask the model, check the answer against the workspace, and if it is no good ask once more
// with the reasons. A second failure uses the fixed fallback. Invalid output never reaches the screen.

export type ModelRequest = { system: string; user: string; schema: Record<string, unknown> }
// Sends one request to the model and returns its reply as text. The only place a model is called from.
export type ModelCaller = (request: ModelRequest) => Promise<string>

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
}

const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/i

function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : 'reply'}: ${issue.message}`)
}

// What a reply is checked against: the request it answers, which says which workspace was on screen and what it held.
type Asked = Pick<ComposeRequest, 'intent' | 'history' | 'view' | 'workspace' | 'invoice'>

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

  const parsed = (asked.view === 'invoice' ? invoiceTurnSchema : turnSchema).safeParse(data)
  if (!parsed.success) return { errors: describeIssues(parsed.error), task }

  const errors = checkTurnFor(parsed.data, { intent: '', ...asked })
  if (errors.length > 0) return { errors, task: parsed.data.task }
  return { turn: normalise(parsed.data), errors: [], task: parsed.data.task }
}

// Hex values are stored the same way everywhere: six digits, upper case.
function normalise(turn: AnyTurn): AnyTurn {
  // Invoice actions hold no colours, so there is nothing to tidy.
  if (turn.actions.some(isInvoiceAction)) return turn
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
  const schema = turnJsonSchema(request.view)
  const system = systemPromptFor(request.view)
  const attempts: Attempt[] = []
  let errors: string[] = []
  let task: Task | undefined

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const text = await call({ system, user: buildUserContent(request, attempt === 0 ? undefined : errors), schema })
    const checked = checkReply(text, request)
    attempts.push({ errors: checked.errors })
    if (checked.turn) return { outcome: attempt === 0 ? 'valid' : 'retried', turn: checked.turn, attempts }
    errors = checked.errors
    task = checked.task ?? task
  }

  return { outcome: 'fallback', turn: fallbackTurn(task, Boolean(request.workspace ?? request.invoice)), note: FALLBACK_NOTE, attempts }
}
