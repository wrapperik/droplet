import { mockUser } from './mockProjects.ts'
import { createSupabaseDocumentStorage, type DocumentsClient } from './supabaseStorage.ts'
import { localDocumentStorage, removeAllLocalDocuments, type DocumentStorage } from './storage.ts'

// Signing in, behind one small interface, so the screens and the store do not know which service is under them. The real one is Supabase
// (email and password, or Google). Without Supabase set up there is a stand-in that is always signed in as the sample founder, so the app
// still runs on this device alone, and the tests need no service.

// `onboarded` is whether they have been through the introduction (see src/pages/Welcome.tsx).
export type AuthUser = { id: string; email: string; name: string; onboarded: boolean }

export type AuthResult =
  | { ok: true; // The account was made but must be confirmed from the email that was sent before signing in.
      needsConfirmation?: boolean }
  | { ok: false; message: string }

export interface AuthBackend {
  readonly kind: 'local' | 'supabase'
  // Where this backend keeps a signed-in founder's documents.
  readonly storage: DocumentStorage
  currentUser(): Promise<AuthUser | null>
  // Told when someone signs in or out, or when the session ends (also from another tab, or after Google sends the founder back).
  onChange(listener: (user: AuthUser | null) => void): () => void
  signUp(input: { name: string; email: string; password: string }): Promise<AuthResult>
  signIn(input: { email: string; password: string }): Promise<AuthResult>
  signInWithGoogle(): Promise<AuthResult>
  signOut(): Promise<void>
  // Remembers, in the account, that the founder has been through the introduction. False if it could not be saved.
  completeOnboarding(): Promise<boolean>
  // Deletes the account and everything in it: every project and what is saved in it, and the log of AI requests (Supabase), or everything saved
  // in this browser (this device alone). On success the founder is signed out. The message of a failure is in the app's words.
  deleteAccount(): Promise<AuthResult>
}

// ---- What is checked before anything is sent ----

export const MIN_PASSWORD = 8
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type Credentials = { name?: string; email: string; password: string }

// What is wrong with what was typed, in plain words, or null. The service checks too: this is so the founder is told at once, and kindly.
export function checkCredentials(mode: 'sign-in' | 'sign-up', { name = '', email, password }: Credentials): string | null {
  if (mode === 'sign-up' && name.trim() === '') return 'Tell us what to call you.'
  if (email.trim() === '') return 'Enter your email address.'
  if (!EMAIL_SHAPE.test(email.trim())) return 'That does not look like an email address.'
  if (password === '') return 'Enter your password.'
  if (mode === 'sign-up' && password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters for your password.`
  return null
}

// What a service said, in the app's words. Anything not recognised is said plainly without the service's own wording.
export function friendlyAuthError(message: string): string {
  const text = message.toLowerCase()
  if (text.includes('invalid login credentials')) return 'That email and password do not match.'
  if (text.includes('already registered') || text.includes('already been registered')) return 'There is already an account with that email. Try signing in.'
  if (text.includes('email not confirmed')) return 'Confirm your email first. We sent you a link when you signed up.'
  if (text.includes('rate limit') || text.includes('too many')) return 'Too many tries. Wait a few minutes and try again.'
  if (text.includes('password should be') || text.includes('weak password')) return `Use at least ${MIN_PASSWORD} characters for your password.`
  if (text.includes('unable to validate email') || text.includes('invalid email')) return 'That does not look like an email address.'
  if (text.includes('failed to fetch') || text.includes('network') || text.includes('load failed')) return 'Could not reach the server. Check your connection and try again.'
  if (text.includes('provider is not enabled') || text.includes('unsupported provider')) return 'Signing in with Google is not switched on yet.'
  return 'Something went wrong. Try again in a moment.'
}

// What went wrong when Supabase sends the founder back from Google or from a link in an email with an error in the address (in the query, or
// after the #), in the app's words, or null when the address carries none. Without this the founder lands on the sign-in screen with no word.
export function authErrorFromUrl(href: string): string | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const read = (key: string) => url.searchParams.get(key) ?? new URLSearchParams(url.hash.replace(/^#/, '')).get(key) ?? ''
  const error = read('error')
  const code = read('error_code')
  const description = read('error_description')
  if (error === '' && code === '' && description === '') return null
  const text = `${code} ${description}`.toLowerCase()
  if (code === 'signup_disabled' || text.includes('signups not allowed')) return 'New accounts are switched off right now. Sign in with an account you already have.'
  if (text.includes('database error saving new user')) return 'Your account could not be made. Try again, or make one with your email and a password.'
  if (code === 'otp_expired' || text.includes('expired')) return 'That link has expired. Sign in again, or make your account again for a new link.'
  if (error === 'access_denied') return 'Signing in with Google was cancelled or not allowed for that account. Try again, or use your email and a password.'
  const friendly = friendlyAuthError(description)
  return friendly === friendlyAuthError('') ? 'Signing in did not work. Try again, or use your email and a password.' : friendly
}

// The address without what Supabase added about an error, so a reload does not show the message again.
export function withoutAuthError(href: string): string {
  const url = new URL(href)
  const keys = ['error', 'error_code', 'error_description']
  keys.forEach((key) => url.searchParams.delete(key))
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  keys.forEach((key) => hash.delete(key))
  url.hash = hash.toString()
  return `${url.pathname}${url.search}${url.hash}`
}

// The name to show: the one they gave, or Google's, or the start of their email.
export function displayNameOf(metadata: Record<string, unknown> | undefined, email: string | undefined): string {
  for (const key of ['display_name', 'full_name', 'name']) {
    const value = metadata?.[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim().slice(0, 80)
  }
  return (email ?? '').split('@')[0] || 'You'
}

// Whether the account has been through the introduction. Kept in the account's own metadata, so it follows the founder to any device.
export const ONBOARDED_KEY = 'onboarded'
export const hasOnboarded = (metadata: Record<string, unknown> | undefined) => metadata?.[ONBOARDED_KEY] === true

// ---- This device alone ----

export const localAuthBackend: AuthBackend = {
  kind: 'local',
  storage: localDocumentStorage,
  async currentUser() {
    return { id: 'local', email: '', name: mockUser.name, onboarded: true }
  },
  onChange() {
    return () => {}
  },
  async signUp() {
    return { ok: true }
  },
  async signIn() {
    return { ok: true }
  },
  async signInWithGoogle() {
    return { ok: true }
  },
  async signOut() {},
  async completeOnboarding() {
    return true
  },
  // There is no account here, only what was saved in this browser, so that is what goes.
  async deleteAccount() {
    return removeAllLocalDocuments() ? { ok: true } : { ok: false, message: 'Could not remove what is saved in this browser. Try again.' }
  },
}

// ---- Supabase ----

type SupabaseUser = { id: string; email?: string; user_metadata?: Record<string, unknown>; identities?: unknown[] | null }
type SupabaseAuthResponse = { data: { user: SupabaseUser | null; session: unknown }; error: { message: string } | null }

// The little of a Supabase client that this needs, so a test can stand in for it.
export type SupabaseAuthClient = DocumentsClient & {
  auth: {
    getSession(): Promise<{ data: { session: { user: SupabaseUser; access_token?: string } | null } }>
    onAuthStateChange(listener: (event: string, session: { user: SupabaseUser } | null) => void): { data: { subscription: { unsubscribe(): void } } }
    signUp(input: { email: string; password: string; options: { data: { display_name: string }; emailRedirectTo: string } }): Promise<SupabaseAuthResponse>
    signInWithPassword(input: { email: string; password: string }): Promise<SupabaseAuthResponse>
    signInWithOAuth(input: { provider: 'google'; options: { redirectTo: string } }): Promise<{ error: { message: string } | null }>
    signOut(options?: { scope?: 'global' | 'local' | 'others' }): Promise<{ error: { message: string } | null }>
    updateUser(input: { data: Record<string, unknown> }): Promise<{ error: { message: string } | null }>
  }
}

const toUser = (user: SupabaseUser | null | undefined): AuthUser | null =>
  user ? { id: user.id, email: user.email ?? '', name: displayNameOf(user.user_metadata, user.email), onboarded: hasOnboarded(user.user_metadata) } : null

// Where the founder is sent after confirming an email or coming back from Google.
const backTo = () => `${window.location.origin}/home`

// Where the `delete-account` Edge Function is: the project's address and the publishable key it asks for (both public, see supabase.ts).
export type DeleteAccountConfig = { url?: string; key?: string; fetch?: typeof fetch }

const DELETE_FAILED = 'Your account could not be deleted. Try again in a moment.'

export function createSupabaseAuthBackend(client: SupabaseAuthClient, config: DeleteAccountConfig = {}): AuthBackend {
  return {
    kind: 'supabase',
    storage: createSupabaseDocumentStorage(client),
    async currentUser() {
      try {
        return toUser((await client.auth.getSession()).data.session?.user)
      } catch {
        return null
      }
    },
    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(toUser(session?.user)))
      return () => data.subscription.unsubscribe()
    },
    async signUp({ name, email, password }) {
      try {
        const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() }, emailRedirectTo: backTo() } })
        if (error) return { ok: false, message: friendlyAuthError(error.message) }
        // For an email that already has an account the service answers as if it had made one, but with no sign-in methods on it.
        if (data.user && data.user.identities?.length === 0) return { ok: false, message: friendlyAuthError('User already registered') }
        return { ok: true, needsConfirmation: data.session === null }
      } catch (error) {
        return { ok: false, message: friendlyAuthError(error instanceof Error ? error.message : '') }
      }
    },
    async signIn({ email, password }) {
      try {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
        return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true }
      } catch (error) {
        return { ok: false, message: friendlyAuthError(error instanceof Error ? error.message : '') }
      }
    },
    async signInWithGoogle() {
      try {
        // On success the browser leaves for Google and comes back to /home, where the session is picked up.
        const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: backTo() } })
        return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true }
      } catch (error) {
        return { ok: false, message: friendlyAuthError(error instanceof Error ? error.message : '') }
      }
    },
    async signOut() {
      await client.auth.signOut()
    },
    async completeOnboarding() {
      try {
        const { error } = await client.auth.updateUser({ data: { [ONBOARDED_KEY]: true } })
        return !error
      } catch {
        return false
      }
    },
    async deleteAccount() {
      const url = (config.url ?? import.meta.env.VITE_SUPABASE_URL)?.replace(/\/+$/, '')
      const key = config.key ?? import.meta.env.VITE_SUPABASE_ANON_KEY
      try {
        // The founder's own access token, not the publishable key: the function checks it with Supabase Auth and deletes whoever it belongs to.
        const token = (await client.auth.getSession()).data.session?.access_token
        if (!url || !token) return { ok: false, message: 'Your session has ended. Sign in again, then try deleting your account.' }
        const response = await (config.fetch ?? fetch)(`${url}/functions/v1/delete-account`, { method: 'POST', headers: { authorization: `Bearer ${token}`, apikey: key ?? '' } })
        if (response.status === 401) return { ok: false, message: 'Your session has ended. Sign in again, then try deleting your account.' }
        if (!response.ok) return { ok: false, message: DELETE_FAILED }
        // The account is gone, so the session is ended here only: asking the service to end it would fail for a user that no longer exists.
        await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
        return { ok: true }
      } catch (error) {
        return { ok: false, message: error instanceof Error && /fetch|network|load failed/i.test(error.message) ? friendlyAuthError(error.message) : DELETE_FAILED }
      }
    },
  }
}
