import { checkTurnFor } from '../compose/rules.ts'
import type { Grounding } from '../compose/grounding.ts'
import { composeHeaders, composeTarget, type ComposeTarget } from './composeEndpoint.ts'
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

export type ComposeSuccess = { ok: true; outcome: Outcome; turn: AnyTurn; answeredBy: Mode; allowance?: Allowance; note?: string; grounding?: Grounding }
// `allowance` is where the Advanced allowance stands, when the server says (it does with a refusal for having none left).
export type ComposeFailure = { ok: false; kind: ComposeFailureKind; message: string; allowance?: Allowance }

const TIMEOUT_MS = 60_000

type Options = { fetchImpl?: typeof fetch; timeoutMs?: number; target?: ComposeTarget; headers?: (target: ComposeTarget) => Promise<Record<string, string>> }

export async function requestComposition(
  request: ComposeRequest,
  { fetchImpl = fetch, timeoutMs = TIMEOUT_MS, target = composeTarget(), headers = composeHeaders }: Options = {},
): Promise<ComposeSuccess | ComposeFailure> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetchImpl(target.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await headers(target)) },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, kind: 'timeout', message: 'That took too long. Try again.' }
    }
    return { ok: false, kind: 'network', message: target.authenticated ? 'I could not reach the composer. Check your connection and try again.' : 'I could not reach the composer. Check that the dev server is running.' }
  } finally {
    clearTimeout(timer)
  }

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
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
