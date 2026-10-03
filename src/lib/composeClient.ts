import { checkTurn } from '../compose/rules.ts'
import { composeResponseSchema, type ComposeRequest, type Outcome, type Turn } from '../compose/spec.ts'

// Asks the composer for a workspace. The browser never talks to the model: it asks this app's own server, which holds
// the key. Whatever comes back is checked again here, with the same schema and the same rules, against the workspace
// it was asked about, so an invalid turn cannot reach the screen even if the server were wrong.

export type ComposeFailureKind =
  | 'network'
  | 'bad_response'
  | 'no_key'
  | 'bad_key'
  | 'bad_model'
  | 'bad_request'
  | 'rate_limited'
  | 'quota'
  | 'timeout'
  | 'unavailable'
  | 'blocked'

export type ComposeSuccess = { ok: true; outcome: Outcome; turn: Turn; note?: string }
export type ComposeFailure = { ok: false; kind: ComposeFailureKind; message: string }

const TIMEOUT_MS = 60_000

type Options = { fetchImpl?: typeof fetch; timeoutMs?: number }

export async function requestComposition(
  request: ComposeRequest,
  { fetchImpl = fetch, timeoutMs = TIMEOUT_MS }: Options = {},
): Promise<ComposeSuccess | ComposeFailure> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetchImpl('/api/compose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, kind: 'timeout', message: 'That took too long. Try again.' }
    }
    return { ok: false, kind: 'network', message: 'I could not reach the composer. Check that the dev server is running.' }
  } finally {
    clearTimeout(timer)
  }

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const failure = (body ?? {}) as { error?: string; message?: string }
    const kinds: ComposeFailureKind[] = ['no_key', 'bad_key', 'bad_model', 'bad_request', 'rate_limited', 'quota', 'timeout', 'unavailable', 'blocked']
    const kind = kinds.find((candidate) => candidate === failure.error) ?? 'unavailable'
    return { ok: false, kind, message: failure.message || 'Something went wrong while composing. Try again.' }
  }

  const parsed = composeResponseSchema.safeParse(body)
  if (!parsed.success || checkTurn(parsed.data.turn, request.workspace).length > 0) {
    return { ok: false, kind: 'bad_response', message: 'I got an answer I could not use. Try again.' }
  }
  return { ok: true, outcome: parsed.data.outcome, turn: parsed.data.turn, ...(parsed.data.note ? { note: parsed.data.note } : {}) }
}
