// What the Supabase Edge Functions share: the headers a browser needs, a JSON reply, reading the bearer token, and asking Supabase Auth who a
// token belongs to. Only `Request`, `Response` and `fetch`, so it runs in Deno and in Node's tests alike.

export type Fetch = typeof fetch

export const corsHeaders = (methods: string) => ({
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': methods,
  'access-control-max-age': '86400',
})

export const jsonReply = (cors: Record<string, string>, status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors, ...extra } })

// The token of an `Authorization: Bearer ...` header, or undefined.
export const bearerToken = (request: Request): string | undefined => /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim() || undefined

// Who a token belongs to, asked of Supabase Auth itself rather than decoded here, so an expired, forged or anonymous (publishable key) token is
// turned away. Null when it belongs to no signed-in founder.
export async function userOfToken(fetchImpl: Fetch, supabaseUrl: string, serviceKey: string, token: string): Promise<{ id: string } | null> {
  const response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: serviceKey, authorization: `Bearer ${token}` } })
  if (!response.ok) return null
  const user = (await response.json().catch(() => null)) as { id?: unknown } | null
  return typeof user?.id === 'string' && user.id !== '' ? { id: user.id } : null
}
