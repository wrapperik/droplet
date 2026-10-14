import { create } from 'zustand'
import { checkCredentials, createSupabaseAuthBackend, localAuthBackend, type AuthBackend, type AuthUser, type SupabaseAuthClient } from '../lib/auth.ts'
import { getSupabase } from '../lib/supabase.ts'
import { localDocumentStorage, setDocumentStorage } from '../lib/storage.ts'

// Who is signed in. `loading` until the session has been looked for, then `signedIn` or `signedOut`. When someone signs in, their documents
// are read and written through their backend's storage (Supabase, or this browser), and when they sign out it goes back to this browser's, so
// one founder's documents are never read as another's.

type Status = 'loading' | 'signedOut' | 'signedIn'

type AuthState = {
  status: Status
  user: AuthUser | null
  // Something is being sent.
  busy: boolean
  // What went wrong, in plain words, and what the founder should do next (such as confirm their email).
  error: string
  notice: string
  // Looks for the session and follows it. Safe to call more than once. Returns what stops following.
  start: () => () => void
  signUp: (input: { name: string; email: string; password: string }) => Promise<void>
  signIn: (input: { email: string; password: string }) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  // The founder has been through the introduction. Never holds them up: if it could not be saved they carry on, and see it again next time.
  completeOnboarding: () => Promise<void>
  // Deletes the account and everything in it. True once it is gone. With an account the founder is then signed out and the sign-in screen
  // says it was deleted; on this device alone only what is saved in this browser goes. A failure is said in `error`, in plain words.
  deleteAccount: () => Promise<boolean>
  clearMessages: () => void
}

let backend: AuthBackend | null = null

// The backend: Supabase if it is set up, else this device alone. A test can put its own.
export function authBackend(): AuthBackend {
  if (!backend) {
    const supabase = getSupabase()
    backend = supabase ? createSupabaseAuthBackend(supabase as unknown as SupabaseAuthClient) : localAuthBackend
  }
  return backend
}

export function setAuthBackend(next: AuthBackend | null) {
  backend = next
}

export const useAuth = create<AuthState>((set, get) => {
  // Who has finished the introduction in this session, so a session event that still carries the old account cannot send them back to it.
  const finished = new Set<string>()

  // The documents follow the founder: set before the state says who is signed in, so nothing is read from the wrong place.
  const follow = (user: AuthUser | null) => {
    setDocumentStorage(user ? authBackend().storage : localDocumentStorage)
    set({ user: user && finished.has(user.id) ? { ...user, onboarded: true } : user, status: user ? 'signedIn' : 'signedOut' })
  }

  let following: (() => void) | null = null
  let sequence = 0

  return {
    status: 'loading',
    user: null,
    busy: false,
    error: '',
    notice: '',

    start: () => {
      if (!following) {
        const mine = ++sequence
        const stop = authBackend().onChange((user) => {
          if (sequence === mine) follow(user)
        })
        authBackend()
          .currentUser()
          .then((user) => {
            if (sequence === mine) follow(user)
          })
        following = () => {
          stop()
          following = null
          sequence++
        }
      }
      return following
    },

    signUp: async (input) => {
      if (get().busy) return
      const problem = checkCredentials('sign-up', input)
      if (problem) return set({ error: problem, notice: '' })
      set({ busy: true, error: '', notice: '' })
      const result = await authBackend().signUp(input)
      if (!result.ok) return set({ busy: false, error: result.message })
      // With email confirmation on there is no session yet: the founder is told to look in their inbox, and is signed in by the link.
      set({ busy: false, notice: result.needsConfirmation ? `We sent a link to ${input.email.trim()}. Open it to finish making your account.` : '' })
    },

    signIn: async (input) => {
      if (get().busy) return
      const problem = checkCredentials('sign-in', input)
      if (problem) return set({ error: problem, notice: '' })
      set({ busy: true, error: '', notice: '' })
      const result = await authBackend().signIn(input)
      set({ busy: false, ...(result.ok ? {} : { error: result.message }) })
    },

    signInWithGoogle: async () => {
      if (get().busy) return
      set({ busy: true, error: '', notice: '' })
      const result = await authBackend().signInWithGoogle()
      set({ busy: false, ...(result.ok ? {} : { error: result.message }) })
    },

    signOut: async () => {
      await authBackend().signOut()
      // On this device alone there is no account to leave, so signing out changes nothing.
      if (authBackend().kind === 'local') return
      // The backend tells the store when the session has ended, but it is set here too, so signing out is never left waiting on that.
      follow(null)
      set({ error: '', notice: '' })
    },

    completeOnboarding: async () => {
      const user = get().user
      if (!user || user.onboarded) return
      finished.add(user.id)
      set({ user: { ...user, onboarded: true } })
      await authBackend().completeOnboarding()
    },

    deleteAccount: async () => {
      if (get().busy) return false
      set({ busy: true, error: '', notice: '' })
      let result: Awaited<ReturnType<AuthBackend['deleteAccount']>>
      try {
        result = await authBackend().deleteAccount()
      } catch {
        result = { ok: false, message: 'Your account could not be deleted. Try again in a moment.' }
      }
      if (!result.ok) {
        set({ busy: false, error: result.message })
        return false
      }
      if (authBackend().kind === 'local') {
        set({ busy: false })
        return true
      }
      // Gone: the documents go back to this browser's storage and nobody is signed in, before the notice is set so the sign-in screen shows it.
      finished.clear()
      follow(null)
      set({ busy: false, error: '', notice: 'Your account and everything in it has been deleted.' })
      return true
    },

    clearMessages: () => set({ error: '', notice: '' }),
  }
})
