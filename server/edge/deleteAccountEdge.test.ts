// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createDeleteAccountHandler, createEdgeDeleteAccountHandler, type DeleteAccountDeps } from './deleteAccountEdge.ts'

const post = (headers: Record<string, string> = { authorization: 'Bearer good-token' }, method = 'POST') => new Request('https://f.example/delete-account', { method, headers })

function setup(over: Partial<DeleteAccountDeps> = {}) {
  const deleted: string[] = []
  const handle = createDeleteAccountHandler({
    authenticate: async (token) => (token === 'good-token' ? { id: 'user-1' } : null),
    deleteUser: async (id) => void deleted.push(id),
    ...over,
  })
  return { handle, deleted }
}

describe('the delete-account function', () => {
  it('deletes the signed-in founder, by the id of their token', async () => {
    const { handle, deleted } = setup()
    const response = await handle(post())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted: true })
    expect(deleted).toEqual(['user-1'])
  })

  it('turns away a request with no token, a token that is not a founder\'s and anything that is not a bearer token, and deletes nobody', async () => {
    const { handle, deleted } = setup()
    for (const headers of [{}, { authorization: 'Bearer wrong' }, { authorization: 'Basic abc' }, { authorization: 'Bearer ' }] as Record<string, string>[]) {
      const response = await handle(post(headers))
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({ error: 'unauthorised' })
    }
    expect(deleted).toEqual([])
  })

  it('answers the browser\'s preflight without a token, allows only POST, and lets the browser read every answer', async () => {
    const { handle } = setup()
    const preflight = await handle(post({}, 'OPTIONS'))
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-headers')).toMatch(/authorization/)
    expect(preflight.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS')
    const wrong = await handle(post({ authorization: 'Bearer good-token' }, 'GET'))
    expect(wrong.status).toBe(405)
    expect(wrong.headers.get('allow')).toBe('POST')
    expect((await handle(post({}))).headers.get('access-control-allow-origin')).toBe('*')
  })

  it('says plainly, with nothing of the service, when the deletion fails', async () => {
    const { handle } = setup({ deleteUser: async () => { throw new Error('service role key abc leaked here') } })
    const response = await handle(post())
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toMatch(/abc|key|service/i)
  })
})

describe('the delete-account function in Supabase', () => {
  const env = { SUPABASE_URL: 'https://abc.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }
  type Call = { url: string; init?: RequestInit }
  function run(answer: (call: Call) => Response, config: Record<string, string> = env) {
    const calls: Call[] = []
    const handle = createEdgeDeleteAccountHandler(config, (async (url: string, init?: RequestInit) => {
      const call = { url, init }
      calls.push(call)
      return answer(call)
    }) as unknown as typeof fetch)
    return { handle, calls }
  }
  const standard = (call: Call) =>
    call.url.endsWith('/auth/v1/user') ? new Response(JSON.stringify({ id: 'user/1' }), { status: 200 }) : new Response('{}', { status: 200 })

  it('asks Supabase Auth who the token is, then deletes that user with the service key and nothing else', async () => {
    const { handle, calls } = run(standard)
    const response = await handle(post())
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(2)
    expect(calls[0].url).toBe('https://abc.supabase.co/auth/v1/user')
    expect(calls[0].init?.headers).toMatchObject({ authorization: 'Bearer good-token' })
    expect(calls[1].url).toBe('https://abc.supabase.co/auth/v1/admin/users/user%2F1')
    expect(calls[1].init?.method).toBe('DELETE')
    expect(calls[1].init?.headers).toEqual({ apikey: 'service-key', authorization: 'Bearer service-key' })
  })

  it('deletes nobody when Supabase Auth does not know the token (expired, forged, or the publishable key)', async () => {
    const { handle, calls } = run(() => new Response('{"msg":"invalid JWT"}', { status: 401 }))
    expect((await handle(post({ authorization: 'Bearer sb_publishable_x' }))).status).toBe(401)
    expect(calls.every((call) => call.init?.method !== 'DELETE')).toBe(true)
  })

  it('counts an account that is already gone as deleted, and anything else as a failure', async () => {
    const gone = run((call) => (call.url.endsWith('/auth/v1/user') ? standard(call) : new Response('{}', { status: 404 })))
    expect((await gone.handle(post())).status).toBe(200)
    const broken = run((call) => (call.url.endsWith('/auth/v1/user') ? standard(call) : new Response('{"msg":"db down"}', { status: 500 })))
    const response = await broken.handle(post())
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('db down')
  })

  it('fails plainly, calling nothing, when the function has no URL or service key', async () => {
    const { handle, calls } = run(standard, {})
    expect((await handle(post())).status).toBe(500)
    expect(calls).toEqual([])
  })
})
