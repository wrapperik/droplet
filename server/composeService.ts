import { ComposeError, composeWorkspace, type ModelCaller } from '../src/compose/compose.ts'
import { composeRequestSchema } from '../src/compose/spec.ts'
import type { CompositionLogEntry } from './compositionLog.ts'
import type { RateLimiter } from './rateLimit.ts'

// The `compose` function: validate the request, call the model, check the answer, log it. It knows nothing about
// HTTP or Vite, so it can be tested directly and moved into a Supabase Edge Function as it is.

export type ComposeServiceDeps = {
  // Null when no API key is set.
  call: ModelCaller | null
  limiter: RateLimiter
  log: (entry: CompositionLogEntry) => void | Promise<void>
  now?: () => number
  // Which model gave the last answer, for the log.
  modelUsed?: () => string | undefined
  // Words to use in place of the standard ones for some failures. The dev server says what to do in .env.local, which means nothing to
  // anyone using the deployed app.
  messages?: Partial<Record<ComposeError['kind'], string>>
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
  no_key: 'No Gemini API key is set. Add GEMINI_API_KEY to .env.local and restart the dev server.',
  bad_key: 'The Gemini API key was refused. Check GEMINI_API_KEY in .env.local.',
  bad_model: 'The Gemini model was not found. Check GEMINI_MODEL in .env.local.',
  bad_request: 'The model rejected the request.',
  rate_limited: 'The model is receiving too many requests. Try again in a minute.',
  quota: 'The free daily limit for the model is used up. Try again later, or set GEMINI_MODEL in .env to another model.',
  timeout: 'The model took too long to answer. Try again.',
  unavailable: 'The model could not be reached. Try again.',
  blocked: 'The model declined that request. Try describing it differently.',
}

export async function handleCompose(body: unknown, deps: ComposeServiceDeps): Promise<ServiceReply> {
  const now = deps.now ?? Date.now
  const started = now()

  const parsed = composeRequestSchema.safeParse(body)
  if (!parsed.success) {
    return { status: 400, body: { error: 'bad_request', message: 'Send a request with an intent of up to 600 characters.' } }
  }
  const request = parsed.data

  // A used-up quota says when it resets. That text is built from numbers only, so it is safe to show.
  const fail = async (kind: ComposeError['kind'], message?: string): Promise<ServiceReply> => {
    await deps.log({ at: new Date(started).toISOString(), intent: request.intent, outcome: 'error', error: kind, ms: now() - started })
    return { status: STATUS[kind], body: { error: kind, message: message ?? deps.messages?.[kind] ?? MESSAGES[kind] } }
  }

  if (!deps.call) return fail('no_key')
  if (!(await deps.limiter.take())) return fail('rate_limited')

  try {
    const result = await composeWorkspace(request, deps.call)
    const problems = result.attempts.flatMap((attempt) => attempt.errors).slice(0, 4)
    await deps.log({
      at: new Date(started).toISOString(),
      intent: request.intent,
      outcome: result.outcome,
      task: result.turn.task,
      actions: result.turn.actions.length,
      badReplies: result.attempts.filter((attempt) => attempt.errors.length > 0).length,
      ...(deps.modelUsed?.() ? { model: deps.modelUsed() } : {}),
      ...(problems.length > 0 ? { problems } : {}),
      ms: now() - started,
    })
    return { status: 200, body: { outcome: result.outcome, turn: result.turn, ...(result.note ? { note: result.note } : {}) } }
  } catch (error) {
    if (error instanceof ComposeError) return fail(error.kind, error.kind === 'quota' ? error.message : undefined)
    await deps.log({ at: new Date(started).toISOString(), intent: request.intent, outcome: 'error', error: 'unexpected', ms: now() - started })
    return { status: 500, body: { error: 'unavailable', message: 'Something went wrong while composing. Try again.' } }
  }
}
