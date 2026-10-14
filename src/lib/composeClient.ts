import { checkTurnFor } from '../compose/rules.ts'
import type { Grounding } from '../compose/grounding.ts'
import { backgroundResponseSchema, chatText, groundingProblems, summaryProblems, type ChatSummary, type SummariseRequest } from '../compose/background.ts'
import { digestSource, type DigestRequest, type WorkspaceDigest } from '../compose/digest.ts'
import { composeHeaders, composeTarget, type ComposeTarget } from './composeEndpoint.ts'
import { stageSchema, type ComposeStage } from '../compose/progress.ts'
import { takeEvents } from './sse.ts'
import { allowanceSchema, composeResponseSchema, type Allowance, type AnyTurn, type ComposeRequest, type Mode, type Outcome } from '../compose/spec.ts'

// Asks the composer for a workspace. The browser never talks to the model: it asks a server that holds the key (the dev server, or
// the `compose` Edge Function when deployed: see composeEndpoint.ts). Whatever comes back is checked again here, with the same schema and the same rules, against the workspace
// it was asked about, so an invalid turn cannot reach the screen even if the server were wrong.

export type ComposeFailureKind =
  | 'network'
  | 'bad_response'
  // The session has ended or there is none: sign in again.
  | 'unauthorised'
  // The founder has no Advanced answers left today.
  | 'advanced_limit'
  | 'no_key'
  | 'bad_key'
  | 'bad_model'
  | 'bad_request'
  | 'rate_limited'
  | 'quota'
  | 'timeout'
  | 'unavailable'
  | 'blocked'
  // The founder pressed Stop. Nothing was applied.
  | 'aborted'

export type ComposeSuccess = { ok: true; outcome: Outcome; turn: AnyTurn; answeredBy: Mode; allowance?: Allowance; note?: string; grounding?: Grounding }
// `allowance` is where the Advanced allowance stands, when the server says (it does with a refusal for having none left).
export type ComposeFailure = { ok: false; kind: ComposeFailureKind; message: string; allowance?: Allowance }

const TIMEOUT_MS = 60_000

type Options = { fetchImpl?: typeof fetch; timeoutMs?: number; target?: ComposeTarget; headers?: (target: ComposeTarget) => Promise<Record<string, string>> }

// Told each stage the composer reports while it works (see compose/progress.ts), and stopped by the founder: aborting the signal gives up on the reply
// and nothing is applied.
type ComposeOptions = Options & { onStage?: (stage: ComposeStage) => void; signal?: AbortSignal }

const STOPPED: ComposeFailure = { ok: false, kind: 'aborted', message: 'Stopped. Nothing was changed.' }
const DROPPED: ComposeFailure = { ok: false, kind: 'network', message: 'I lost the connection while it was working. Try again.' }

// Reads a stream of events to its result. Stages go to `onStage` as they arrive; the result is the status and body the plain JSON response would have had.
async function readStream(response: Response, onStage: ComposeOptions['onStage'], abort: AbortSignal): Promise<{ status: number; body: unknown } | null> {
  const reader = response.body?.getReader()
  if (!reader) return null
  // A browser ends the body itself when the request is aborted; this makes sure of it, so a stop or a timeout never leaves the read waiting.
  abort.addEventListener('abort', () => void reader.cancel().catch(() => undefined), { once: true })
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const taken = takeEvents(buffer)
    buffer = taken.rest
    for (const event of taken.events) {
      let data: unknown
      try {
        data = JSON.parse(event.data)
      } catch {
        continue
      }
      if (event.event === 'stage') {
        const stage = stageSchema.safeParse(data)
        if (stage.success) onStage?.(stage.data)
      } else if (event.event === 'result') {
        const result = (data ?? {}) as { status?: unknown; body?: unknown }
        return { status: typeof result.status === 'number' ? result.status : 500, body: result.body }
      }
    }
    if (done) return null
  }
}

export async function requestComposition(
  request: ComposeRequest,
  { fetchImpl = fetch, timeoutMs = TIMEOUT_MS, target = composeTarget(), headers = composeHeaders, onStage, signal }: ComposeOptions = {},
): Promise<ComposeSuccess | ComposeFailure> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  // The founder's Stop gives up on the reply the same way a timeout does.
  const stop = () => controller.abort()
  if (signal?.aborted) {
    clearTimeout(timer)
    return STOPPED
  }
  signal?.addEventListener('abort', stop, { once: true })

  let status: number
  let body: unknown
  try {
    const response = await fetchImpl(target.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream, application/json', ...(await headers(target)) },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
    status = response.status
    if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
      const streamed = await readStream(response, onStage, controller.signal)
      if (!streamed) return signal?.aborted ? STOPPED : controller.signal.aborted ? { ok: false, kind: 'timeout', message: 'That took too long. Try again.' } : DROPPED
      status = streamed.status
      body = streamed.body
    } else {
      body = await response.json().catch(() => null)
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Stopping by hand is the founder's own doing; any other abort is the clock.
      return signal?.aborted ? STOPPED : { ok: false, kind: 'timeout', message: 'That took too long. Try again.' }
    }
    return { ok: false, kind: 'network', message: target.authenticated ? 'I could not reach the composer. Check your connection and try again.' : 'I could not reach the composer. Check that the dev server is running.' }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', stop)
  }

  if (status < 200 || status >= 300) {
    const failure = (body ?? {}) as { error?: string; message?: string; allowance?: unknown }
    const kinds: ComposeFailureKind[] = ['unauthorised', 'advanced_limit', 'no_key', 'bad_key', 'bad_model', 'bad_request', 'rate_limited', 'quota', 'timeout', 'unavailable', 'blocked']
    const kind = kinds.find((candidate) => candidate === failure.error) ?? 'unavailable'
    const allowance = allowanceSchema.safeParse(failure.allowance)
    return { ok: false, kind, message: failure.message || 'Something went wrong while composing. Try again.', ...(allowance.success ? { allowance: allowance.data } : {}) }
  }

  const parsed = composeResponseSchema.safeParse(body)
  if (!parsed.success || checkTurnFor(parsed.data.turn, request).length > 0) {
    return { ok: false, kind: 'bad_response', message: 'I got an answer I could not use. Try again.' }
  }
  return {
    ok: true,
    outcome: parsed.data.outcome,
    turn: parsed.data.turn,
    answeredBy: parsed.data.answeredBy,
    ...(parsed.data.allowance ? { allowance: parsed.data.allowance } : {}),
    ...(parsed.data.note ? { note: parsed.data.note } : {}), ...(parsed.data.grounding ? { grounding: parsed.data.grounding } : {}),
  }
}

// Where the founder's Advanced allowance stands, asked before the first message so the menu can show it. Null when it could not be found out, in which
// case the menu shows no count and the server still holds the limit.
export async function fetchAllowance({ fetchImpl = fetch, timeoutMs = 10_000, target = composeTarget(), headers = composeHeaders }: Options = {}): Promise<Allowance | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(target.url, { method: 'GET', headers: await headers(target), signal: controller.signal })
    if (!response.ok) return null
    const parsed = allowanceSchema.safeParse(((await response.json().catch(() => null)) as { allowance?: unknown } | null)?.allowance)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Sends a piece of background work to the composer, with the same address and headers as a message, and reads the answer. Whatever it makes is checked
// again by the caller against what it was made from.
async function sendBackground(request: SummariseRequest | DigestRequest, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS, target = composeTarget(), headers = composeHeaders }: Options): Promise<{ ok: true; body: unknown } | ComposeFailure> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetchImpl(target.url, { method: 'POST', headers: { 'content-type': 'application/json', ...(await headers(target)) }, body: JSON.stringify(request), signal: controller.signal })
  } catch (error) {
    return error instanceof Error && error.name === 'AbortError' ? { ok: false, kind: 'timeout', message: 'That took too long.' } : { ok: false, kind: 'network', message: 'I could not reach the composer.' }
  } finally {
    clearTimeout(timer)
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const failure = (body ?? {}) as { error?: string; message?: string }
    const kinds: ComposeFailureKind[] = ['unauthorised', 'no_key', 'bad_key', 'bad_model', 'bad_request', 'rate_limited', 'quota', 'timeout', 'unavailable', 'blocked']
    return { ok: false, kind: kinds.find((candidate) => candidate === failure.error) ?? 'unavailable', message: failure.message || 'Something went wrong.' }
  }
  return { ok: true, body }
}

// A short memory of a chat, made in the background by Quick. The memory is checked here again against the chat, as every reply is, and kept only if every
// name and figure in it is in the chat; otherwise it is nothing (`summary: null`). A failure to reach the composer is a failure, not a missing memory.
export async function requestSummary(messages: SummariseRequest['messages'], options: Options = {}): Promise<{ ok: true; summary: ChatSummary | null } | ComposeFailure> {
  const request: SummariseRequest = { kind: 'summarise_chat', messages }
  const sent = await sendBackground(request, options)
  if (!sent.ok) return sent
  const parsed = backgroundResponseSchema.safeParse(sent.body)
  if (!parsed.success || parsed.data.kind !== 'summarise_chat') return { ok: false, kind: 'bad_response', message: 'I got an answer I could not use.' }
  const summary = parsed.data.summary
  return { ok: true, summary: summary && summaryProblems(summary, chatText(request)).length === 0 ? summary : null }
}

// A digest of a workspace, made in the background by Quick, and checked here again against the items it was made from. Nothing if it cannot be trusted.
export async function requestDigest(request: DigestRequest, options: Options = {}): Promise<{ ok: true; digest: WorkspaceDigest | null } | ComposeFailure> {
  const sent = await sendBackground(request, options)
  if (!sent.ok) return sent
  const parsed = backgroundResponseSchema.safeParse(sent.body)
  if (!parsed.success || parsed.data.kind !== 'digest_workspace') return { ok: false, kind: 'bad_response', message: 'I got an answer I could not use.' }
  const digest = parsed.data.digest
  const lines = digest ? [digest.about, ...digest.decided, ...digest.open, ...digest.standouts.map((entry) => entry.reason)] : []
  return { ok: true, digest: digest && groundingProblems(lines, digestSource(request), [], 'the items').length === 0 ? digest : null }
}
