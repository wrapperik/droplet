import type { ModelCaller } from '../../src/compose/compose.ts'
import { callerFromEnv, type ComposeEnv } from '../composeEnv.ts'
import { handleAllowance, handleCompose } from '../composeService.ts'
import { EVENT_STREAM, eventStream, wantsStream } from '../composeStream.ts'
import type { CompositionLogEntry } from '../compositionLog.ts'
import { DAY_MS, type AdvancedUse } from '../rateLimit.ts'
import { bearerToken, corsHeaders, jsonReply, userOfToken, type Fetch } from './edgeHttp.ts'

// The `compose` function as it runs in Supabase (an Edge Function, in Deno). It uses only what the web gives every runtime, `Request`,
// `Response` and `fetch`, so it is tested here in Node and needs no Supabase library. In front of the same service the dev server uses it
// adds what a deployed app needs and the dev server does not:
//
//   1. The caller must be a signed-in founder. The bearer token is checked with Supabase Auth itself, not just decoded, so an expired,
//      forged or anonymous (publishable key) token is turned away.
//   2. A limit per founder, counted from the `compositions` table (the pitch's design), so it holds across every instance of the function:
//      so many requests an hour, and so many Advanced answers in a day (a request Quick answered for Google's busy model does not count).
//   3. A record of how each request went (valid, retried, fallback or error), in `compositions`. **It never stores what the founder
//      wrote**: only the task, the outcome, the mode, the model, the tokens used and the time (manifesto principle 6, and the interviewees who would
//      not give AI their client details).
//
// The Gemini key is a secret of the function and is read here and nowhere else.

const HOUR_MS = 60 * 60 * 1000
// A board is sent with the request, and so can up to three attached files (8 MB, a third larger as base64): room for both. Everything else in a request is
// bounded by its own schema, so a large body is only ever files.
export const MAX_BODY_BYTES = 12_000_000

export type ComposeHandlerDeps = {
  // Null when no API key is set.
  call: ModelCaller | null
  // Who the bearer token belongs to, or null if it belongs to no signed-in founder.
  authenticate: (token: string) => Promise<{ id: string } | null>
  // How many compositions this founder asked for since the given time. Throws if it cannot be found out.
  recentCount: (userId: string, sinceIso: string) => Promise<number>
  record: (userId: string, entry: CompositionLogEntry) => Promise<void>
  limitPerHour: number
  // Advanced answers a founder may have in a day. 0 turns Advanced off.
  advancedPerDay: number
  // How many Advanced answers this founder has had since the given time, and when the oldest was given. Throws if it cannot be found out.
  advancedUse: (userId: string, sinceIso: string) => Promise<AdvancedUse>
  now?: () => number
}

const CORS = corsHeaders('GET, POST, OPTIONS')

const json = (status: number, body: unknown, extra: Record<string, string> = {}) => jsonReply(CORS, status, body, extra)

// What the deployed app says where the dev server tells you to edit .env.local.
const MESSAGES = {
  no_key: 'The composer is not set up on the server yet.',
  bad_key: 'The composer could not use its model key. This is for whoever runs Droplet to fix.',
  bad_model: 'The composer could not find its model. This is for whoever runs Droplet to fix.',
  quota: 'The free daily limit for the model is used up. Try again later.',
} as const

export function createComposeHandler(deps: ComposeHandlerDeps): (request: Request) => Promise<Response> {
  const now = deps.now ?? Date.now

  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (request.method !== 'POST' && request.method !== 'GET') return json(405, { error: 'bad_request', message: 'Use POST.' }, { allow: 'GET, POST' })

    try {
      const token = bearerToken(request)
      const user = token ? await deps.authenticate(token) : null
      if (!user) return json(401, { error: 'unauthorised', message: 'Sign in to use Droplet.' })

      // The founder's Advanced allowance and the Advanced answers behind it, over a sliding day.
      const advanced = {
        limit: deps.advancedPerDay,
        status: () => deps.advancedUse(user.id, new Date(now() - DAY_MS).toISOString()),
        // The row this request writes says which mode answered, so spending needs nothing more.
        spend: () => undefined,
      }
      if (request.method === 'GET') {
        const reply = await handleAllowance({ advanced })
        return json(reply.status, reply.body)
      }

      const declared = Number(request.headers.get('content-length'))
      if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json(413, { error: 'bad_request', message: 'That request is too large.' })
      const text = await request.text()
      if (text.length > MAX_BODY_BYTES) return json(413, { error: 'bad_request', message: 'That request is too large.' })
      let body: unknown
      try {
        body = JSON.parse(text)
      } catch {
        body = undefined
      }

      const serviceDeps = {
        call: deps.call,
        now,
        messages: MESSAGES,
        limiter: { take: async () => (await deps.recentCount(user.id, new Date(now() - HOUR_MS).toISOString())) < deps.limitPerHour },
        advanced,
        log: (entry: CompositionLogEntry) => deps.record(user.id, entry),
      }
      // Asked for the stage as it changes: server-sent events, ending with the reply (its status is in the last event). Anything else gets the plain JSON.
      if (wantsStream(request.headers.get('accept'))) {
        const stream = eventStream((onStage) => handleCompose(body, { ...serviceDeps, onStage }))
        return new Response(stream, { status: 200, headers: { ...CORS, 'content-type': EVENT_STREAM, 'cache-control': 'no-store', 'x-accel-buffering': 'no' } })
      }
      const reply = await handleCompose(body, serviceDeps)
      return json(reply.status, reply.body)
    } catch (error) {
      // Anything unexpected, including the database being unreachable: said plainly, and never with what went wrong inside. The cause goes to
      // the function's own log (the Supabase dashboard), as a message only, never with what the founder asked.
      console.error('compose failed:', error instanceof Error ? error.message : String(error))
      return json(500, { error: 'unavailable', message: 'Something went wrong while composing. Try again.' })
    }
  }
}

// ---- Supabase, over plain HTTP ----

// The deps for the real thing: Supabase Auth and the `compositions` table through their HTTP APIs, with the function's own service key.
export function createEdgeComposeHandler(env: ComposeEnv, fetchImpl: Fetch = fetch): (request: Request) => Promise<Response> {
  const url = env.SUPABASE_URL?.replace(/\/+$/, '') ?? ''
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const service = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
  const configured = callerFromEnv(env)
  // Only the count is wanted, from the Content-Range header: "0-0/12", or "*/0" when there are none.
  const count = async (query: string) => {
    const response = await fetchImpl(`${url}/rest/v1/compositions?${query}`, { headers: { ...service, prefer: 'count=exact', range: '0-0' } })
    if (!response.ok) throw new Error(`could not count (${response.status})`)
    const total = Number(response.headers.get('content-range')?.split('/')[1])
    if (!Number.isFinite(total)) throw new Error('could not count')
    return total
  }

  return createComposeHandler({
    call: configured.call,
    limitPerHour: configured.limitPerHour,
    advancedPerDay: configured.advancedPerDay,

    async authenticate(token) {
      return userOfToken(fetchImpl, url, serviceKey, token)
    },

    async recentCount(userId, sinceIso) {
      return count(`select=id&user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(sinceIso)}`)
    },

    // The founder's Advanced answers, oldest first: only the first row is read, for when one comes back, and the count from the header.
    async advancedUse(userId, sinceIso) {
      const response = await fetchImpl(
        `${url}/rest/v1/compositions?select=created_at&user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(sinceIso)}&answered_by=eq.advanced&order=created_at.asc`,
        { headers: { ...service, prefer: 'count=exact', range: '0-0' } },
      )
      if (!response.ok) throw new Error(`could not count (${response.status})`)
      const used = Number(response.headers.get('content-range')?.split('/')[1])
      if (!Number.isFinite(used)) throw new Error('could not count')
      const rows = (await response.json().catch(() => [])) as { created_at?: unknown }[]
      const first = typeof rows[0]?.created_at === 'string' ? Date.parse(rows[0].created_at) : Number.NaN
      return { used, oldestAt: used > 0 && Number.isFinite(first) ? first : null }
    },

    async record(userId, entry) {
      // Never the intent. Logging must never break a request, so a failure here is dropped.
      const row = {
        user_id: userId,
        outcome: entry.outcome,
        task: entry.task ?? null,
        mode: entry.mode ?? null,
        answered_by: entry.answeredBy ?? null,
        model: entry.model ?? null,
        prompt_tokens: entry.tokens?.prompt ?? null,
        answer_tokens: entry.tokens?.answer ?? null,
        thinking_tokens: entry.tokens?.thinking ?? null,
        error: entry.error ?? null,
        actions: entry.actions ?? null,
        bad_replies: entry.badReplies ?? null,
        ms: Math.round(entry.ms),
        searched: Boolean(entry.searches),
        search_refused: Boolean(entry.searchRefused),
      }
      try {
        await fetchImpl(`${url}/rest/v1/compositions`, { method: 'POST', headers: { ...service, 'content-type': 'application/json', prefer: 'return=minimal' }, body: JSON.stringify(row) })
      } catch {
        // Dropped.
      }
    },
  })
}
