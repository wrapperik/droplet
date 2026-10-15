import { ComposeError, composeWorkspace, type ModelCaller } from '../src/compose/compose.ts'
import { backgroundRequestSchema, isBackgroundRequest } from '../src/compose/background.ts'
import { runDigest, runSummarise } from '../src/compose/runBackground.ts'
import type { ComposeStage } from '../src/compose/progress.ts'
import { groundingOfSearch, mergeResults, planQueries, queryFor, wantsResearch, type WebResult, type WebSearched, type WebSearcher } from '../src/compose/webSearch.ts'
import { composeRequestSchema, modeOf, type Allowance } from '../src/compose/spec.ts'
import type { CompositionLogEntry } from './compositionLog.ts'
import { DAY_MS, type AdvancedAllowance, type AdvancedUse, type RateLimiter } from './rateLimit.ts'

// The `compose` function: validate the request, call the model, check the answer, log it. It knows nothing about
// HTTP or Vite, so it can be tested directly and moved into a Supabase Edge Function as it is.

export type ComposeServiceDeps = {
  // Null when no API key is set.
  call: ModelCaller | null
  limiter: RateLimiter
  // The founder's daily allowance of Advanced answers. Advanced is refused, before any model is called, when none is left.
  advanced: AdvancedAllowance
  log: (entry: CompositionLogEntry) => void | Promise<void>
  now?: () => number
  // Words to use in place of the standard ones for some failures. The dev server says what to do in .env.local, which means nothing to
  // anyone using the deployed app.
  messages?: Partial<Record<ComposeError['kind'], string>>
  // Searches the web when the founder asks for research. Null when no search key is set: research is then answered from what the model knows, and it says so.
  search?: WebSearcher | null
  // Told where the work has got to, for the progress the founder sees. Only a stage, never what was written.
  onStage?: (stage: ComposeStage) => void
}

export type ServiceReply = { status: number; body: Record<string, unknown> }

const STATUS: Record<ComposeError['kind'], number> = {
  no_key: 503,
  bad_key: 502,
  bad_model: 502,
  bad_request: 502,
  rate_limited: 429,
  quota: 429,
  timeout: 504,
  unavailable: 503,
  blocked: 422,
}

const MESSAGES: Record<ComposeError['kind'], string> = {
  no_key: 'No API key is set for the model. Add GEMINI_API_KEY (or, with AI_PROVIDER=deepseek, DEEPSEEK_API_KEY) to .env.local and restart the dev server.',
  bad_key: 'The model\'s API key was refused. Check GEMINI_API_KEY (or DEEPSEEK_API_KEY) in .env.local.',
  bad_model: 'The model was not found. Check the model name in .env.local (GEMINI_BASE_MODEL, or DEEPSEEK_MODEL with AI_PROVIDER=deepseek).',
  bad_request: 'The model rejected the request.',
  rate_limited: 'The model is receiving too many requests. Try again in a minute.',
  quota: 'The free daily limit for the model is used up. Try again later, or set GEMINI_BASE_MODEL in .env to another model.',
  timeout: 'The model took too long to answer. Try again.',
  unavailable: 'The model could not be reached. Try again.',
  blocked: 'The model declined that request. Try describing it differently.',
}

export const BUSY_NOTE = 'Advanced is busy today, so I answered with Quick.'
const UNAVAILABLE_NOTE = 'Advanced is not available right now, so I answered with Quick.'

const hoursText = (ms: number) => {
  const hours = Math.round(ms / 3_600_000)
  return hours >= 1 ? `in about ${hours} ${hours === 1 ? 'hour' : 'hours'}` : 'within the hour'
}

// Where the allowance stands, from how many have been used and when the oldest was given (it comes back a day after that).
export function allowanceOf(use: AdvancedUse, limit: number): Allowance {
  return { advancedLeft: Math.max(0, limit - use.used), advancedLimit: limit, resetsAt: use.oldestAt === null ? null : new Date(use.oldestAt + DAY_MS).toISOString() }
}

// Reading the allowance may fail (the Edge Function asks a database). That is never a failed request: it means Advanced is not offered this time.
const readUse = async (deps: Pick<ComposeServiceDeps, 'advanced'>): Promise<AdvancedUse | null> => {
  try {
    return await deps.advanced.status()
  } catch {
    return null
  }
}

// The allowance on its own, for the interface to show before anything has been asked.
export async function handleAllowance(deps: Pick<ComposeServiceDeps, 'advanced'>): Promise<ServiceReply> {
  const use = await readUse(deps)
  if (!use) return { status: 500, body: { error: 'unavailable', message: 'I could not count your Advanced answers. Try again.' } }
  return { status: 200, body: { allowance: allowanceOf(use, deps.advanced.limit) } }
}

// Work done in the background, such as a short memory of a chat that was left. It has a `kind` of its own, is always answered by Quick, never counts
// against the Advanced allowance, never searches, and counts toward the hourly limit like any other request. What the founder wrote is never logged.
async function handleBackground(body: unknown, deps: ComposeServiceDeps): Promise<ServiceReply> {
  const now = deps.now ?? Date.now
  const started = now()
  const parsed = backgroundRequestSchema.safeParse(body)
  if (!parsed.success) return { status: 400, body: { error: 'bad_request', message: 'That request is not one I can do.' } }
  const request = parsed.data
  const fail = async (kind: ComposeError['kind']): Promise<ServiceReply> => {
    await deps.log({ at: new Date(started).toISOString(), intent: `(${request.kind})`, outcome: 'error', task: request.kind, mode: 'base', error: kind, ms: now() - started })
    return { status: STATUS[kind], body: { error: kind, message: deps.messages?.[kind] ?? MESSAGES[kind] } }
  }
  if (!deps.call) return fail('no_key')
  if (!(await deps.limiter.take())) return fail('rate_limited')
  try {
    const result = request.kind === 'summarise_chat' ? await runSummarise(request, deps.call) : await runDigest(request, deps.call)
    await deps.log({
      at: new Date(started).toISOString(),
      intent: `(${request.kind})`,
      outcome: result.value ? 'valid' : 'fallback',
      task: request.kind,
      mode: 'base',
      answeredBy: 'base',
      ...(result.meta?.model ? { model: result.meta.model } : {}),
      ...(result.meta?.usage ? { tokens: result.meta.usage } : {}),
      ...(result.value ? {} : { problems: result.problems.slice(0, 4) }),
      ms: now() - started,
    })
    return { status: 200, body: { kind: request.kind, answeredBy: 'base', ...(request.kind === 'summarise_chat' ? { summary: result.value } : { digest: result.value }) } }
  } catch (error) {
    if (error instanceof ComposeError) return fail(error.kind)
    await deps.log({ at: new Date(started).toISOString(), intent: `(${request.kind})`, outcome: 'error', task: request.kind, mode: 'base', error: 'unexpected', ms: now() - started })
    return { status: 500, body: { error: 'unavailable', message: 'Something went wrong. Try again.' } }
  }
}

export async function handleCompose(body: unknown, deps: ComposeServiceDeps): Promise<ServiceReply> {
  if (isBackgroundRequest(body)) return handleBackground(body, deps)
  const now = deps.now ?? Date.now
  const started = now()

  const parsed = composeRequestSchema.safeParse(body)
  if (!parsed.success) {
    return { status: 400, body: { error: 'bad_request', message: 'Send a request with a message of up to 4,000 characters.' } }
  }
  const request = parsed.data
  const asked = modeOf(request)
  const limit = deps.advanced.limit
  // Asked for at once and awaited only when needed, so a Quick answer does not wait for the count.
  const usePromise = readUse(deps)

  const failure = async (kind: string, status: number, message: string, error: string = kind): Promise<ServiceReply> => {
    await deps.log({ at: new Date(started).toISOString(), intent: request.intent, outcome: 'error', mode: asked, error, ms: now() - started })
    const use = await usePromise
    return { status, body: { error: kind, message, ...(use ? { allowance: allowanceOf(use, limit) } : {}) } }
  }
  // A used-up quota says when it resets. That text is built from numbers only, so it is safe to show.
  const fail = (kind: ComposeError['kind'], message?: string) => failure(kind, STATUS[kind], message ?? deps.messages?.[kind] ?? MESSAGES[kind])

  if (!deps.call) return fail('no_key')

  // Advanced is refused before any model is called when the founder has none left. When the count cannot be read, the founder gets Quick, and is told.
  let mode = asked
  let degraded: string | undefined
  if (asked === 'advanced') {
    const use = await usePromise
    if (!use) {
      mode = 'base'
      degraded = UNAVAILABLE_NOTE
    } else if (limit - use.used <= 0) {
      const wait = use.oldestAt === null ? '' : ` One comes back ${hoursText(use.oldestAt + DAY_MS - now())}.`
      return failure('advanced_limit', 429, limit === 0 ? 'Advanced is not available.' : `You have used your ${limit} Advanced ${limit === 1 ? 'answer' : 'answers'} for today.${wait} Quick is still here.`)
    }
  }

  if (!(await deps.limiter.take())) return fail('rate_limited')

  try {
    // Research: when the founder's own words ask for it and a search is set up, the web is searched here, and what comes back goes to the model to read.
    let web: WebSearched | undefined
    let searchNote: string | undefined
    if (!deps.search && wantsResearch(request.intent)) {
      // Asked for research with no search set up: said plainly, so it is clear why nothing was looked up and what to do about it.
      web = { refused: 'web search is not set up on this server (no TAVILY_API_KEY)' }
      searchNote = 'Web search is not set up yet (the server has no TAVILY_API_KEY), so this answer is from what I know and may be out of date.'
      console.warn('compose: research was asked for but TAVILY_API_KEY is not set, so nothing was searched')
    } else if (deps.search && wantsResearch(request.intent)) {
      const facts = request.project?.facts
      // The message itself is checked first: with a private detail in it nothing is searched, however the searches would have been worded.
      const fallback = queryFor(request.intent, { what: facts?.['profile.what'], where: facts?.['profile.where'] })
      if ('refused' in fallback) {
        web = { refused: fallback.refused }
        searchNote = fallback.refused
      } else {
        // The searches are written for the research from the request and what the business does, not copied from the message. If that cannot be done, the
        // founder's own words are searched.
        deps.onStage?.({ stage: 'planning' })
        const planned = await planQueries(deps.call, request)
        const queries = planned ?? [fallback.query]
        deps.onStage?.({ stage: 'searching', query: queries[0].slice(0, 200) })
        const settled = await Promise.allSettled(queries.map((query) => deps.search!(query)))
        const lists = settled.flatMap((outcome): WebResult[][] => (outcome.status === 'fulfilled' ? [outcome.value] : []))
        if (lists.length === 0) {
          // Every search failed, which is not a failed request: the model answers without and says so.
          web = { refused: 'the search service could not be reached' }
          searchNote = 'The web search could not be reached, so this answer is from what I know and may be out of date.'
        } else {
          const results = mergeResults(lists)
          web = { queries, results }
          if (results.length === 0) searchNote = 'The web search found nothing for that.'
        }
      }
    }
    const result = await composeWorkspace({ ...request, mode }, deps.call, deps.onStage, web)
    const meta = result.meta
    const answeredBy = meta?.answeredBy ?? mode
    // Only an answer Advanced itself gave counts against the founder. Quick answering for Google's busy model does not.
    const spent = answeredBy === 'advanced'
    if (spent) await Promise.resolve(deps.advanced.spend()).catch(() => undefined)
    const busy = asked === 'advanced' && mode === 'advanced' && answeredBy === 'base' ? BUSY_NOTE : undefined
    const note = [busy ?? degraded, searchNote, result.note].filter(Boolean).join(' ') || undefined

    const use = await usePromise
    const allowance = use ? allowanceOf({ used: use.used + (spent ? 1 : 0), oldestAt: use.oldestAt ?? (spent ? now() : null) }, limit) : undefined

    const problems = result.attempts.flatMap((attempt) => attempt.errors).slice(0, 4)
    await deps.log({
      at: new Date(started).toISOString(),
      intent: request.intent,
      outcome: result.outcome,
      task: result.turn.task,
      mode: asked,
      answeredBy,
      actions: result.turn.actions.length,
      badReplies: result.attempts.filter((attempt) => attempt.errors.length > 0).length,
      ...(meta?.model ? { model: meta.model } : {}),
      ...(meta?.usage ? { tokens: meta.usage } : {}),
      ...(problems.length > 0 ? { problems } : {}),
      ...(result.searches > 0 ? { searches: result.searches } : {}),
      ...(meta?.searchRefused ? { searchRefused: true } : {}),
      ms: now() - started,
    })
    return {
      status: 200,
      body: { outcome: result.outcome, answeredBy, ...(allowance ? { allowance } : {}), turn: result.turn, ...(note ? { note } : {}), ...(result.grounding ? { grounding: result.grounding } : web && 'results' in web && web.results.length > 0 ? { grounding: groundingOfSearch(web) } : {}) },
    }
  } catch (error) {
    if (error instanceof ComposeError) return fail(error.kind, error.kind === 'quota' ? error.message : undefined)
    // The cause, for the server's own log only, as a message and never with what the founder asked.
    console.error('compose: unexpected error:', error instanceof Error ? error.message : String(error))
    await deps.log({ at: new Date(started).toISOString(), intent: request.intent, outcome: 'error', mode: asked, error: 'unexpected', ms: now() - started })
    return { status: 500, body: { error: 'unavailable', message: 'Something went wrong while composing. Try again.' } }
  }
}
