import { bearerToken, corsHeaders, jsonReply, userOfToken, type Fetch } from './edgeHttp.ts'

// The `delete-account` function as it runs in Supabase (an Edge Function, in Deno). Like `compose` it uses only `Request`, `Response` and
// `fetch`, so it is tested here in Node and needs no Supabase library.
//
// It deletes the signed-in founder's account, and with it everything they made. Deleting the row in `auth.users` is the whole job, because
// every table hangs off it with `on delete cascade` (see supabase/migrations):
//
//   auth.users  ->  profiles            (id references auth.users, init)
//               ->  projects            (owner_id references auth.users, init)
//                       ->  project_documents  (project_id references projects: palette, board, invoice, memory, chats, notes)
//               ->  compositions        (user_id references auth.users, the log of AI requests)
//
// There are no Storage buckets yet (logos and exports are later), so nothing is left outside the database. When a bucket is added, its files
// must be removed here too, before the user is, since a cascade does not reach Storage.
//
// Only the founder can ask, and only for their own account: the id comes from their token, checked with Supabase Auth, never from the request.
// The call to delete needs the service role key, which is why this is a server function and not something the browser does.

const CORS = corsHeaders('POST, OPTIONS')
const json = (status: number, body: unknown, extra: Record<string, string> = {}) => jsonReply(CORS, status, body, extra)

export type DeleteAccountDeps = {
  // Who the bearer token belongs to, or null if it belongs to no signed-in founder.
  authenticate: (token: string) => Promise<{ id: string } | null>
  // Removes the account and everything under it. Resolves when it is gone (or was already), rejects if it could not be done.
  deleteUser: (userId: string) => Promise<void>
}

export function createDeleteAccountHandler(deps: DeleteAccountDeps): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (request.method !== 'POST') return json(405, { error: 'bad_request', message: 'Use POST.' }, { allow: 'POST' })

    try {
      const token = bearerToken(request)
      const user = token ? await deps.authenticate(token) : null
      if (!user) return json(401, { error: 'unauthorised', message: 'Sign in to use Droplet.' })
      await deps.deleteUser(user.id)
      return json(200, { deleted: true })
    } catch {
      // Anything unexpected, said plainly and never with what went wrong inside (which could name the service or its keys).
      return json(500, { error: 'unavailable', message: 'Your account could not be deleted. Try again.' })
    }
  }
}

// ---- Supabase, over plain HTTP ----

// The deps for the real thing: Supabase Auth's admin API with the function's own service key. Supabase gives an Edge Function
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY by default, the same two `compose` reads.
export function createEdgeDeleteAccountHandler(env: Record<string, string | undefined>, fetchImpl: Fetch = fetch): (request: Request) => Promise<Response> {
  const url = env.SUPABASE_URL?.replace(/\/+$/, '') ?? ''
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  return createDeleteAccountHandler({
    async authenticate(token) {
      if (url === '' || serviceKey === '') throw new Error('not configured')
      return userOfToken(fetchImpl, url, serviceKey, token)
    },

    async deleteUser(userId) {
      const response = await fetchImpl(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
      })
      // Already gone is as good as gone, so asking twice does no harm.
      if (!response.ok && response.status !== 404) throw new Error(`could not delete (${response.status})`)
    },
  })
}
