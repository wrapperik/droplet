import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// The one Supabase client. The URL and the publishable key are meant to be in the browser (what a founder can reach is decided by the
// row-level security in the database, not by hiding the key), so they are read from `VITE_` variables. The secret key never is.
//
// Without them the app runs on this device alone: no sign-in, and what is saved stays in this browser. That is how the tests run, and how
// the app runs for anyone who has not set Supabase up.

export const supabaseConfigured = (): boolean => Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

let client: SupabaseClient | null = null

// The client, made on first use. Null when Supabase is not set up.
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured()) return null
  client ??= createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  return client
}
