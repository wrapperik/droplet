import { getSupabase } from './supabase.ts'

// Where the app asks the composer. The browser never talks to the model: it asks a server that holds the key.
//
//   - In development, the dev server's own `/api/compose` (it reads the Gemini key from .env). No sign-in is needed, and the limit is local.
//   - In the deployed app, the `compose` Supabase Edge Function, with the signed-in founder's token, which the function checks.
//   - `VITE_COMPOSE_URL` overrides both, for trying the deployed function from the dev server, or pointing at another.

export const DEV_COMPOSE_PATH = '/api/compose'

export type ComposeTarget = { url: string; authenticated: boolean }

export function resolveComposeTarget(options: { composeUrl?: string; supabaseUrl?: string; production: boolean }): ComposeTarget {
  const supabaseUrl = options.supabaseUrl?.replace(/\/+$/, '')
  const override = options.composeUrl?.trim()
  if (override) return { url: override, authenticated: Boolean(supabaseUrl && override.startsWith(supabaseUrl)) }
  if (options.production && supabaseUrl) return { url: `${supabaseUrl}/functions/v1/compose`, authenticated: true }
  return { url: DEV_COMPOSE_PATH, authenticated: false }
}

export const composeTarget = (): ComposeTarget =>
  resolveComposeTarget({ composeUrl: import.meta.env.VITE_COMPOSE_URL, supabaseUrl: import.meta.env.VITE_SUPABASE_URL, production: import.meta.env.PROD })

// The headers that go with a request to the Edge Function: the founder's own access token (not the publishable key, which anyone can read),
// and the publishable key the platform asks for. Without a session there is no token, and the function says to sign in.
export async function composeHeaders(target: ComposeTarget): Promise<Record<string, string>> {
  if (!target.authenticated) return {}
  const session = (await getSupabase()?.auth.getSession())?.data.session
  return session ? { authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } : { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }
}
