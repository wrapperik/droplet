import type { ModelCaller } from '../../src/compose/compose.ts'
import { callerFromEnv, type ComposeEnv } from '../composeEnv.ts'
import { handleCompose } from '../composeService.ts'
import type { CompositionLogEntry } from '../compositionLog.ts'

// The `compose` function as it runs in Supabase (an Edge Function, in Deno). It uses only what the web gives every runtime, `Request`,
// `Response` and `fetch`, so it is tested here in Node and needs no Supabase library. In front of the same service the dev server uses it
// adds what a deployed app needs and the dev server does not:
//
//   1. The caller must be a signed-in founder. The bearer token is checked with Supabase Auth itself, not just decoded, so an expired,
//      forged or anonymous (publishable key) token is turned away.
//   2. A limit per founder, counted from the `compositions` table (the pitch's design), so it holds across every instance of the function.
//   3. A record of how each request went (valid, retried, fallback or error), in `compositions`. **It never stores what the founder
//      wrote**: only the task, the outcome, the model and the time (manifesto principle 6, and the interviewees who would not give AI
//      their client details).
//
// The Gemini key is a secret of the function and is read here and nowhere else.

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
// A board is sent with the request, up to 120 things with their words, so this is room for one.
export const MAX_BODY_BYTES = 90_000

export type ComposeHandlerDeps = {
  // Null when no API key is set.
  call: ModelCaller | null
  // Who the bearer token belongs to, or null if it belongs to no signed-in founder.
  authenticate: (token: string) => Promise<{ id: string } | null>
  // How many compositions this founder asked for since the given time. Throws if it cannot be found out.
  recentCount: (userId: string, sinceIso: string) => Promise<number>
  record: (userId: string, entry: CompositionLogEntry) => Promise<void>
  limitPerHour: number
  // Requests a founder may have answered with a web search in a day. 0 (the default) never searches.
  searchPerDay?: number
  // How many of this founder's requests since the given time searched the web. Throws if it cannot be found out.
  recentSearches?: (userId: string, sinceIso: string) => Promise<number>
  modelUsed?: () => string | undefined
  now?: () => number
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '86400',
}

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS, ...extra } })

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
    if (request.method !== 'POST') return json(405, { error: 'bad_request', message: 'Use POST.' }, { allow: 'POST' })

    try {
      const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim()
      const user = token ? await deps.authenticate(token) : null
      if (!user) return json(401, { error: 'unauthorised', message: 'Sign in to use Droplet.' })

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

      const reply = await handleCompose(body, {
        call: deps.call,
        now,
        modelUsed: deps.modelUsed,
        messages: MESSAGES,
        limiter: { take: async () => (await deps.recentCount(user.id, new Date(now() - HOUR_MS).toISOString())) < deps.limitPerHour },
        // Off unless a daily allowance is set. The row this request writes says whether it searched, so spending needs nothing more.
        ...(deps.searchPerDay && deps.searchPerDay > 0 && deps.recentSearches
          ? { search: { allowed: async () => (await deps.recentSearches!(user.id, new Date(now() - DAY_MS).toISOString())) < deps.searchPerDay!, spend: () => undefined } }
          : {}),
        log: (entry) => deps.record(user.id, entry),
      })
      return json(reply.status, reply.body)
    } catch {
      // Anything unexpected, including the database being unreachable: said plainly, and never with what went wrong inside.
      return json(500, { error: 'unavailable', message: 'Something went wrong while composing. Try again.' })
    }
  }
}

// ---- Supabase, over plain HTTP ----

type Fetch = typeof fetch

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
    modelUsed: configured.modelUsed,
    // Off unless COMPOSE_SEARCH_PER_DAY is set, which needs the migration that adds `searched` (see docs/deploy.md).
    searchPerDay: configured.searchPerDay ?? 0,

    async authenticate(token) {
      const response = await fetchImpl(`${url}/auth/v1/user`, { headers: { apikey: serviceKey, authorization: `Bearer ${token}` } })
      if (!response.ok) return null
      const user = (await response.json().catch(() => null)) as { id?: unknown } | null
      return typeof user?.id === 'string' && user.id !== '' ? { id: user.id } : null
    },

    async recentCount(userId, sinceIso) {
      return count(`select=id&user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(sinceIso)}`)
    },

    async recentSearches(userId, sinceIso) {
      return count(`select=id&user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(sinceIso)}&searched=is.true`)
    },

    async record(userId, entry) {
      // Never the intent. Logging must never break a request, so a failure here is dropped.
      const row = {
        user_id: userId,
        outcome: entry.outcome,
        task: entry.task ?? null,
        model: entry.model ?? null,
        error: entry.error ?? null,
        actions: entry.actions ?? null,
        bad_replies: entry.badReplies ?? null,
        ms: Math.round(entry.ms),
        // Written only when it searched, which happens only once the column exists (search is off until then).
        ...(entry.searches ? { searched: true } : {}),
      }
      try {
        await fetchImpl(`${url}/rest/v1/compositions`, { method: 'POST', headers: { ...service, 'content-type': 'application/json', prefer: 'return=minimal' }, body: JSON.stringify(row) })
      } catch {
        // Dropped.
      }
    },
  })
}
