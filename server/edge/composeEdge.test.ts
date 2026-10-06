// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ComposeError, type ModelCaller } from '../../src/compose/compose.ts'
import { validOpenReply } from '../../src/compose/fixtures.ts'
import type { CompositionLogEntry } from '../compositionLog.ts'
import type { AdvancedUse } from '../rateLimit.ts'
import { createComposeHandler, createEdgeComposeHandler, MAX_BODY_BYTES, type ComposeHandlerDeps } from './composeEdge.ts'

const good: ModelCaller = async () => validOpenReply
const post = (body: unknown, headers: Record<string, string> = { authorization: 'Bearer good-token' }) =>
  new Request('https://f.example/compose', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })

function setup(over: Partial<ComposeHandlerDeps> = {}, recent = 0, advancedUsed: AdvancedUse = { used: 0, oldestAt: null }) {
  const recorded: { userId: string; entry: CompositionLogEntry }[] = []
  const counted: { userId: string; since: string }[] = []
  const countedAdvanced: { userId: string; since: string }[] = []
  const deps: ComposeHandlerDeps = {
    call: good,
    limitPerHour: 3,
    now: () => Date.parse('2026-10-05T12:00:00Z'),
    authenticate: async (token) => (token === 'good-token' ? { id: 'user-1' } : null),
    recentCount: async (userId, since) => {
      counted.push({ userId, since })
      return recent
    },
    advancedPerDay: 10,
    advancedUse: async (userId, since) => {
      countedAdvanced.push({ userId, since })
      return advancedUsed
    },
    record: async (userId, entry) => void recorded.push({ userId, entry }),
    ...over,
  }
  return { handle: createComposeHandler(deps), recorded, counted, countedAdvanced }
}

describe('the compose function', () => {
  it('answers a signed-in founder\'s good request with the spec and how it went, and records it against them', async () => {
    const { handle, recorded } = setup()
    const response = await handle(post({ intent: 'a colour palette for my gift box business' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ outcome: 'valid', answeredBy: 'base', turn: { task: 'brand' } })
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({ userId: 'user-1', entry: { outcome: 'valid', task: 'brand' } })
  })

  it('turns away a request with no token, a token that is not a signed-in founder\'s, and anything that is not a bearer token, before anything else', async () => {
    let asked = false
    const { handle, recorded } = setup({ call: async () => { asked = true; return validOpenReply } })
    for (const headers of [{}, { authorization: 'Bearer wrong' }, { authorization: 'Basic abc' }, { authorization: 'Bearer ' }] as Record<string, string>[]) {
      const response = await handle(post({ intent: 'a palette' }, headers))
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthorised', message: 'Sign in to use Droplet.' })
    }
    expect(asked).toBe(false)
    expect(recorded).toEqual([])
  })

  it('answers the browser\'s preflight with the headers it needs, without needing a token', async () => {
    const { handle } = setup()
    const response = await handle(new Request('https://f.example/compose', { method: 'OPTIONS' }))
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-headers')).toMatch(/authorization/)
    expect(response.headers.get('access-control-allow-methods')).toMatch(/POST/)
    expect(response.headers.get('access-control-allow-methods')).toMatch(/GET/)
  })

  it('allows the browser to read every answer, including a refusal', async () => {
    const { handle } = setup()
    expect((await handle(post({ intent: 'a palette' }))).headers.get('access-control-allow-origin')).toBe('*')
    expect((await handle(post({ intent: 'a palette' }, {}))).headers.get('access-control-allow-origin')).toBe('*')
  })

  it('takes only POST, and GET for the allowance, and says so', async () => {
    const { handle } = setup()
    const response = await handle(new Request('https://f.example/compose', { method: 'PUT', headers: { authorization: 'Bearer good-token' } }))
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, POST')
  })

  it('tells a signed-in founder where their Advanced allowance stands on a GET, and nobody else', async () => {
    const { handle, countedAdvanced, recorded } = setup({}, 0, { used: 3, oldestAt: Date.parse('2026-10-05T08:00:00Z') })
    const response = await handle(new Request('https://f.example/compose', { method: 'GET', headers: { authorization: 'Bearer good-token' } }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ allowance: { advancedLeft: 7, advancedLimit: 10, resetsAt: '2026-10-06T08:00:00.000Z' } })
    expect(countedAdvanced).toEqual([{ userId: 'user-1', since: '2026-10-04T12:00:00.000Z' }])
    // asking costs nothing: no row is written
    expect(recorded).toEqual([])
    const anonymous = await handle(new Request('https://f.example/compose', { method: 'GET' }))
    expect(anonymous.status).toBe(401)
  })

  it('counts Advanced over the last day, refuses the one past the allowance before any model is called, and answers Quick all the same', async () => {
    let asked = 0
    const { handle, recorded } = setup({ call: async () => { asked += 1; return validOpenReply } }, 0, { used: 10, oldestAt: Date.parse('2026-10-05T09:00:00Z') })
    const refused = await handle(post({ intent: 'a palette', mode: 'advanced' }))
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ error: 'advanced_limit', allowance: { advancedLeft: 0, advancedLimit: 10, resetsAt: '2026-10-06T09:00:00.000Z' } })
    expect(asked).toBe(0)
    expect(recorded[0]).toMatchObject({ entry: { outcome: 'error', error: 'advanced_limit', mode: 'advanced' } })
    expect((await handle(post({ intent: 'a palette' }))).status).toBe(200)
    expect(asked).toBe(1)
  })

  it('says it cannot count Advanced rather than failing, when the count cannot be found out, and answers with Quick', async () => {
    const { handle } = setup({ advancedUse: async () => { throw new Error('db-internal-host refused') } })
    const response = await handle(post({ intent: 'a palette', mode: 'advanced' }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { answeredBy: string; note: string; allowance?: unknown }
    expect(body).toMatchObject({ answeredBy: 'base', note: 'Advanced is not available right now, so I answered with Quick.' })
    expect(body.allowance).toBeUndefined()
    const asking = await handle(new Request('https://f.example/compose', { method: 'GET', headers: { authorization: 'Bearer good-token' } }))
    expect(asking.status).toBe(500)
    expect(JSON.stringify(await asking.json())).not.toContain('db-internal-host')
  })

  it('holds a founder to a number of requests an hour, counted over the last hour, and says so with a 429', async () => {
    const { handle, recorded } = setup({}, 3)
    const response = await handle(post({ intent: 'a palette' }))
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ error: 'rate_limited' })
    expect(recorded[0]).toMatchObject({ entry: { outcome: 'error', error: 'rate_limited' } })
  })

  it('counts this founder\'s own requests for the hour before now, and lets one through when they are under the limit', async () => {
    const { handle, counted } = setup({}, 2)
    expect((await handle(post({ intent: 'a palette' }))).status).toBe(200)
    expect(counted).toEqual([{ userId: 'user-1', since: '2026-10-05T11:00:00.000Z' }])
  })

  it('says something plain, and nothing about the inside, when the count cannot be found out', async () => {
    const { handle } = setup({ recentCount: async () => { throw new Error('connection to db-internal-host refused') } })
    const response = await handle(post({ intent: 'a palette' }))
    expect(response.status).toBe(500)
    const body = JSON.stringify(await response.json())
    expect(body).toContain('Something went wrong while composing')
    expect(body).not.toContain('db-internal-host')
  })

  it('says in the deployed app\'s words, not the dev server\'s, when there is no key', async () => {
    const { handle } = setup({ call: null })
    const response = await handle(post({ intent: 'a palette' }))
    expect(response.status).toBe(503)
    const message = ((await response.json()) as { message: string }).message
    expect(message).toBe('The composer is not set up on the server yet.')
    expect(message).not.toMatch(/\.env/)
  })

  it('says a used-up quota with when it resets, and a model that declines in the usual words', async () => {
    const quota = setup({ call: async () => { throw new ComposeError('quota', 'The free daily limit for the model is used up. It resets in about 5 hours.') } })
    const said = (await (await quota.handle(post({ intent: 'a palette' }))).json()) as { error: string; message: string }
    expect(said).toMatchObject({ error: 'quota', message: expect.stringMatching(/resets in about 5 hours/) })
    expect(said.message).not.toMatch(/\.env|GEMINI_/)
    const blocked = setup({ call: async () => { throw new ComposeError('blocked', 'declined') } })
    expect((await blocked.handle(post({ intent: 'a palette' }))).status).toBe(422)
  })

  it('rejects a request that is not shaped right, as the dev server does', async () => {
    const { handle } = setup()
    expect((await handle(post({ intent: '' }))).status).toBe(400)
    expect((await handle(post('not json'))).status).toBe(400)
  })

  it('refuses a body that is too large, by what it says and by what it is', async () => {
    const { handle } = setup()
    const big = JSON.stringify({ intent: 'a palette', padding: 'x'.repeat(MAX_BODY_BYTES) })
    expect((await handle(post(big))).status).toBe(413)
    expect((await handle(post(big, { authorization: 'Bearer good-token', 'content-length': String(big.length) }))).status).toBe(413)
  })
})

// The real thing's calls to Supabase, over HTTP, with a stand-in for fetch.
describe('the compose function in Supabase', () => {
  type Call = { url: string; init?: RequestInit }
  function fakeSupabase(over: { user?: Response | null; count?: Response; advanced?: Response; insert?: Response | Error } = {}) {
    const calls: Call[] = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url.includes('/auth/v1/user')) return over.user ?? new Response(JSON.stringify({ id: 'user-1', email: 'm@example.com' }), { status: 200 })
      if (url.includes('/rest/v1/compositions') && init?.method === 'POST') {
        if (over.insert instanceof Error) throw over.insert
        return over.insert ?? new Response(null, { status: 201 })
      }
      if (url.includes('answered_by=eq.advanced')) return over.advanced ?? new Response('[]', { status: 200, headers: { 'content-range': '*/0' } })
      if (url.includes('/rest/v1/compositions')) return over.count ?? new Response('[]', { status: 206, headers: { 'content-range': '0-0/1' } })
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    return { fetchImpl, calls }
  }
  const env = { SUPABASE_URL: 'https://abc.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'service-key', GEMINI_API_KEY: 'g-key', COMPOSE_LIMIT_PER_HOUR: '2' }
  // The function makes its own model caller from the environment, which would reach the real API: stand in for the global fetch it uses.
  const withModel = async <T,>(run: () => Promise<T>): Promise<T> => {
    const before = globalThis.fetch
    globalThis.fetch = (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: validOpenReply }] }, finishReason: 'STOP' }] }), { status: 200 })) as unknown as typeof fetch
    try {
      return await run()
    } finally {
      globalThis.fetch = before
    }
  }

  it('asks Supabase Auth who the token belongs to, with the token, and turns away one that Auth does not know', async () => {
    const { fetchImpl, calls } = fakeSupabase({ user: new Response(JSON.stringify({ message: 'bad jwt' }), { status: 401 }) })
    const handle = createEdgeComposeHandler(env, fetchImpl)
    const response = await handle(post({ intent: 'a palette' }, { authorization: 'Bearer forged' }))
    expect(response.status).toBe(401)
    expect(calls[0].url).toBe('https://abc.supabase.co/auth/v1/user')
    expect(calls[0].init?.headers).toMatchObject({ authorization: 'Bearer forged' })
  })

  it('does not take a reply from Auth that has no user id in it for a signed-in founder (the publishable key\'s own token has none)', async () => {
    const { fetchImpl } = fakeSupabase({ user: new Response(JSON.stringify({ role: 'anon' }), { status: 200 }) })
    const handle = createEdgeComposeHandler(env, fetchImpl)
    expect((await handle(post({ intent: 'a palette' }))).status).toBe(401)
  })

  it('counts the founder\'s rows from the Content-Range header, with the function\'s own key, and holds them to the limit', async () => {
    const full = fakeSupabase({ count: new Response('[]', { status: 206, headers: { 'content-range': '0-0/2' } }) })
    const response = await withModel(() => createEdgeComposeHandler(env, full.fetchImpl)(post({ intent: 'a palette' })))
    expect(response.status).toBe(429)
    const count = full.calls.find((call) => call.url.includes('select=id'))!
    expect(count.url).toContain('user_id=eq.user-1')
    expect(count.url).toMatch(/created_at=gte\.2\d{3}-/)
    expect(count.init?.headers).toMatchObject({ apikey: 'service-key', authorization: 'Bearer service-key', prefer: 'count=exact' })
  })

  it('reads none as none ("*/0"), and answers', async () => {
    const empty = fakeSupabase({ count: new Response('[]', { status: 200, headers: { 'content-range': '*/0' } }) })
    expect((await withModel(() => createEdgeComposeHandler(env, empty.fetchImpl)(post({ intent: 'a palette' })))).status).toBe(200)
  })

  const gemini = (extra: Record<string, unknown> = {}, candidate: Record<string, unknown> = {}) => ({
    candidates: [{ content: { parts: [{ text: validOpenReply }] }, finishReason: 'STOP', ...candidate }],
    ...extra,
  })
  // Stands in for Google, and remembers what it was sent.
  const withGoogle = async <T,>(reply: Record<string, unknown>, run: () => Promise<T>): Promise<{ result: T; sent: { url: string; body: Record<string, unknown> }[] }> => {
    const sent: { url: string; body: Record<string, unknown> }[] = []
    const before = globalThis.fetch
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      sent.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify(reply), { status: 200 })
    }) as unknown as typeof fetch
    try {
      return { result: await run(), sent }
    } finally {
      globalThis.fetch = before
    }
  }
  const insertOf = (calls: Call[]) => JSON.parse(String(calls.find((call) => call.init?.method === 'POST' && call.url.endsWith('/rest/v1/compositions'))!.init?.body)) as Record<string, unknown>

  it('answers Quick with the Quick model and no search, records the tokens it used, and says nothing of them to the founder', async () => {
    const { fetchImpl, calls } = fakeSupabase()
    const { result, sent } = await withGoogle(gemini({ usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 90, thoughtsTokenCount: 20 } }), () => createEdgeComposeHandler(env, fetchImpl)(post({ intent: 'a palette' })))
    expect(sent[0].url).toContain('/models/gemini-3.5-flash-lite:')
    expect(sent[0].body.tools).toBeUndefined()
    expect(insertOf(calls)).toMatchObject({ mode: 'base', answered_by: 'base', model: 'gemini-3.5-flash-lite', prompt_tokens: 1500, answer_tokens: 90, thinking_tokens: 20, searched: false, search_refused: false })
    const body = (await result.json()) as Record<string, unknown>
    expect(body).toMatchObject({ answeredBy: 'base', allowance: { advancedLeft: 10, advancedLimit: 10, resetsAt: null } })
    expect(JSON.stringify(body)).not.toMatch(/token|1500/i)
  })

  it('answers Advanced with the Advanced model and Google Search, counts the founder\'s Advanced rows over the last day, and marks the row that answered and searched', async () => {
    const advanced = new Response(JSON.stringify([{ created_at: '2026-10-05T07:00:00.000Z' }]), { status: 206, headers: { 'content-range': '0-0/4' } })
    const { fetchImpl, calls } = fakeSupabase({ advanced })
    const { result, sent } = await withGoogle(gemini({}, { groundingMetadata: { webSearchQueries: ['palette trends'] } }), () => createEdgeComposeHandler(env, fetchImpl)(post({ intent: 'a palette', mode: 'advanced' })))
    expect(result.status).toBe(200)
    const body = (await result.json()) as { grounding?: unknown; answeredBy: string; allowance: unknown }
    expect(body.grounding).toEqual({ queries: ['palette trends'], sources: [] })
    // 4 used before, and this one makes 5; the oldest one returns a day after it was given
    expect(body).toMatchObject({ answeredBy: 'advanced', allowance: { advancedLeft: 5, advancedLimit: 10, resetsAt: '2026-10-06T07:00:00.000Z' } })
    expect(sent[0].url).toContain('/models/gemini-3.8-flash:')
    expect(sent[0].body.tools).toEqual([{ googleSearch: {} }])
    const counted = calls.find((call) => call.url.includes('answered_by=eq.advanced'))!
    expect(counted.url).toContain('user_id=eq.user-1')
    expect(counted.url).toMatch(/created_at=gte\.2026-10-0\d/)
    expect(counted.url).toContain('order=created_at.asc')
    expect(counted.init?.headers).toMatchObject({ prefer: 'count=exact', range: '0-0', apikey: 'service-key' })
    expect(insertOf(calls)).toMatchObject({ mode: 'advanced', answered_by: 'advanced', model: 'gemini-3.8-flash', searched: true })
  })

  it('refuses an Advanced request the founder has no answers left for, without calling Google', async () => {
    const used = new Response(JSON.stringify([{ created_at: '2026-10-05T07:00:00.000Z' }]), { status: 206, headers: { 'content-range': '0-0/10' } })
    const { fetchImpl, calls } = fakeSupabase({ advanced: used })
    const { result, sent } = await withGoogle(gemini(), () => createEdgeComposeHandler(env, fetchImpl)(post({ intent: 'a palette', mode: 'advanced' })))
    expect(result.status).toBe(429)
    expect(await result.json()).toMatchObject({ error: 'advanced_limit', allowance: { advancedLeft: 0 } })
    expect(sent).toHaveLength(0)
    expect(insertOf(calls)).toMatchObject({ mode: 'advanced', outcome: 'error', error: 'advanced_limit', answered_by: null })
  })

  it('counts Quick answered for Google\'s busy model as Quick: the row says base, so the founder keeps the Advanced answer', async () => {
    const { fetchImpl, calls } = fakeSupabase()
    const before = globalThis.fetch
    let n = 0
    globalThis.fetch = (async () => {
      n += 1
      // Advanced is out of quota; Quick answers
      if (n === 1) return new Response(JSON.stringify({ error: { message: 'quota', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel' }], retryDelay: '3600s' }] } }), { status: 429 })
      return new Response(JSON.stringify(gemini()), { status: 200 })
    }) as unknown as typeof fetch
    try {
      const response = await createEdgeComposeHandler(env, fetchImpl)(post({ intent: 'a palette', mode: 'advanced' }))
      expect(await response.json()).toMatchObject({ answeredBy: 'base', note: 'Advanced is busy today, so I answered with Quick.', allowance: { advancedLeft: 10 } })
    } finally {
      globalThis.fetch = before
    }
    expect(insertOf(calls)).toMatchObject({ mode: 'advanced', answered_by: 'base', model: 'gemini-3.5-flash-lite' })
  })

  it('answers a GET with the allowance and nothing else, and writes no row', async () => {
    const { fetchImpl, calls } = fakeSupabase({ advanced: new Response('[]', { status: 200, headers: { 'content-range': '*/0' } }) })
    const response = await createEdgeComposeHandler(env, fetchImpl)(new Request('https://f.example/compose', { headers: { authorization: 'Bearer good-token' } }))
    expect(await response.json()).toEqual({ allowance: { advancedLeft: 10, advancedLimit: 10, resetsAt: null } })
    expect(calls.some((call) => call.init?.method === 'POST')).toBe(false)
  })

  it('takes the daily number of Advanced answers from COMPOSE_ADVANCED_PER_DAY, and turns Advanced off with 0', async () => {
    const { fetchImpl } = fakeSupabase()
    const five = await createEdgeComposeHandler({ ...env, COMPOSE_ADVANCED_PER_DAY: '5' }, fetchImpl)(new Request('https://f.example/compose', { headers: { authorization: 'Bearer good-token' } }))
    expect(await five.json()).toMatchObject({ allowance: { advancedLimit: 5 } })
    const off = await createEdgeComposeHandler({ ...env, COMPOSE_ADVANCED_PER_DAY: '0' }, fetchImpl)(post({ intent: 'a palette', mode: 'advanced' }))
    expect(off.status).toBe(429)
    expect(await off.json()).toMatchObject({ error: 'advanced_limit', message: 'Advanced is not available.' })
  })

  it('records how it went with no words of the founder\'s, or the model\'s, in the row', async () => {
    const { fetchImpl, calls } = fakeSupabase()
    const response = await withModel(() => createEdgeComposeHandler(env, fetchImpl)(post({ intent: 'a palette for Pretoria Print Works invoices at R450' })))
    expect(response.status).toBe(200)
    const insert = calls.find((call) => call.init?.method === 'POST' && call.url.endsWith('/rest/v1/compositions'))!
    const row = JSON.parse(String(insert.init?.body)) as Record<string, unknown>
    expect(Object.keys(row).sort()).toEqual(['actions', 'answer_tokens', 'answered_by', 'bad_replies', 'error', 'mode', 'model', 'ms', 'outcome', 'prompt_tokens', 'search_refused', 'searched', 'task', 'thinking_tokens', 'user_id'])
    expect(row).toMatchObject({ user_id: 'user-1', outcome: 'valid', task: 'brand' })
    expect(JSON.stringify(row)).not.toMatch(/Pretoria|invoice|R450/i)
    expect(insert.init?.headers).toMatchObject({ prefer: 'return=minimal', apikey: 'service-key' })
  })

  it('still answers when the record could not be written: logging must never break a request', async () => {
    const { fetchImpl } = fakeSupabase({ insert: new Error('db down') })
    expect((await withModel(() => createEdgeComposeHandler(env, fetchImpl)(post({ intent: 'a palette' })))).status).toBe(200)
  })

  it('says there is no key when the function has none, after the founder has been checked', async () => {
    const { fetchImpl } = fakeSupabase()
    const response = await createEdgeComposeHandler({ ...env, GEMINI_API_KEY: '' }, fetchImpl)(post({ intent: 'a palette' }))
    expect(response.status).toBe(503)
  })
})
