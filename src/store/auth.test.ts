import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthBackend, AuthResult, AuthUser } from '../lib/auth.ts'
import { documentStorage, localDocumentStorage, setDocumentStorage, type DocumentStorage } from '../lib/storage.ts'
import { slowMemoryStorage } from '../test/slowStorage.ts'
import { setAuthBackend, useAuth } from './auth.ts'

const megan: AuthUser = { id: 'u1', email: 'megan@example.com', name: 'Megan', onboarded: true }

// A backend a test controls: who is signed in, what it answers, and who is listening.
function fakeBackend(options: { user?: AuthUser | null; kind?: 'local' | 'supabase'; signUp?: AuthResult; signIn?: AuthResult; google?: AuthResult; guest?: AuthResult; onboardingSaved?: boolean; deleteAccount?: AuthResult } = {}) {
  const storage = slowMemoryStorage(1).driver
  const listeners = new Set<(user: AuthUser | null) => void>()
  let current: AuthUser | null = options.user ?? null
  const calls: string[] = []
  const backend: AuthBackend = {
    kind: options.kind ?? 'supabase',
    storage,
    currentUser: async () => current,
    onChange: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    signUp: async () => {
      calls.push('signUp')
      return options.signUp ?? { ok: true, needsConfirmation: true }
    },
    signIn: async () => {
      calls.push('signIn')
      return options.signIn ?? { ok: true }
    },
    signInWithGoogle: async () => {
      calls.push('google')
      return options.google ?? { ok: true }
    },
    signInAsGuest: async () => {
      calls.push('guest')
      return options.guest ?? { ok: true }
    },
    signOut: async () => {
      calls.push('signOut')
      current = null
    },
    completeOnboarding: async () => {
      calls.push('completeOnboarding')
      return options.onboardingSaved ?? true
    },
    deleteAccount: async () => {
      calls.push('deleteAccount')
      const result = options.deleteAccount ?? { ok: true }
      if (result.ok) current = null
      return result
    },
  }
  return { backend, storage, calls, emit: (user: AuthUser | null) => { current = user; listeners.forEach((listener) => listener(user)) }, listenerCount: () => listeners.size }
}

let stop: (() => void) | null = null
let before: DocumentStorage
beforeEach(() => {
  before = documentStorage()
  useAuth.setState({ status: 'loading', user: null, busy: false, error: '', notice: '' })
})
afterEach(() => {
  stop?.()
  stop = null
  setAuthBackend(null)
  setDocumentStorage(before)
})

const start = () => {
  stop = useAuth.getState().start()
}

describe('looking for the session', () => {
  it('is loading until it has looked, then signed in with who it found, and the documents follow them', async () => {
    const { backend, storage } = fakeBackend({ user: megan })
    setAuthBackend(backend)
    expect(useAuth.getState().status).toBe('loading')
    start()
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('signedIn'))
    expect(useAuth.getState().user).toEqual(megan)
    expect(documentStorage()).toBe(storage)
  })

  it('is signed out when nobody is signed in, and the documents stay in this browser', async () => {
    setAuthBackend(fakeBackend({ user: null }).backend)
    start()
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('signedOut'))
    expect(documentStorage()).toBe(localDocumentStorage)
  })

  it('follows the session after it: signing in from a link or from Google, and signing out in another tab', async () => {
    const { backend, emit, storage } = fakeBackend({ user: null })
    setAuthBackend(backend)
    start()
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('signedOut'))
    emit(megan)
    expect(useAuth.getState()).toMatchObject({ status: 'signedIn', user: megan })
    expect(documentStorage()).toBe(storage)
    emit(null)
    expect(useAuth.getState()).toMatchObject({ status: 'signedOut', user: null })
    expect(documentStorage()).toBe(localDocumentStorage)
  })

  it('looks only once however many times it is asked, and stops following when told to', async () => {
    const { backend, listenerCount } = fakeBackend({ user: megan })
    setAuthBackend(backend)
    const first = useAuth.getState().start()
    const second = useAuth.getState().start()
    expect(second).toBe(first)
    expect(listenerCount()).toBe(1)
    first()
    expect(listenerCount()).toBe(0)
  })

  it('does not let a look that was stopped change anything when it arrives late', async () => {
    const { backend } = fakeBackend({ user: megan })
    setAuthBackend(backend)
    useAuth.getState().start()()
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(useAuth.getState().status).toBe('loading')
  })

  it('on this device alone is signed in as the sample founder, with this browser\'s storage', async () => {
    const { backend } = fakeBackend({ user: megan, kind: 'local' })
    setAuthBackend({ ...backend, storage: localDocumentStorage })
    start()
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('signedIn'))
    expect(documentStorage()).toBe(localDocumentStorage)
  })
})

describe('signing in', () => {
  it('tells the founder what is wrong with what they typed, without asking the service', async () => {
    const { backend, calls } = fakeBackend()
    setAuthBackend(backend)
    await useAuth.getState().signIn({ email: 'nonsense', password: 'pw' })
    expect(useAuth.getState().error).toBe('That does not look like an email address.')
    await useAuth.getState().signUp({ name: '', email: 'm@example.com', password: 'longenough' })
    expect(useAuth.getState().error).toBe('Tell us what to call you.')
    expect(calls).toEqual([])
  })

  it('asks the service with good details, and is not busy afterwards', async () => {
    const { backend, calls } = fakeBackend()
    setAuthBackend(backend)
    const pending = useAuth.getState().signIn({ email: 'm@example.com', password: 'pw' })
    expect(useAuth.getState().busy).toBe(true)
    await pending
    expect(useAuth.getState()).toMatchObject({ busy: false, error: '' })
    expect(calls).toEqual(['signIn'])
  })

  it('shows what the service said, in the app\'s words, and clears it when asked or on the next try', async () => {
    setAuthBackend(fakeBackend({ signIn: { ok: false, message: 'That email and password do not match.' } }).backend)
    await useAuth.getState().signIn({ email: 'm@example.com', password: 'nope' })
    expect(useAuth.getState().error).toBe('That email and password do not match.')
    useAuth.getState().clearMessages()
    expect(useAuth.getState().error).toBe('')
  })

  it('does not call the service again while it is still being asked: the second press waits for the first', async () => {
    const { backend, calls } = fakeBackend()
    setAuthBackend(backend)
    await Promise.all([useAuth.getState().signIn({ email: 'm@example.com', password: 'pw' }), useAuth.getState().signIn({ email: 'm@example.com', password: 'pw' })])
    expect(calls).toEqual(['signIn'])
  })

  it('goes to Google, and says what went wrong if it cannot', async () => {
    const { backend, calls } = fakeBackend({ google: { ok: false, message: 'Signing in with Google is not switched on yet.' } })
    setAuthBackend(backend)
    await useAuth.getState().signInWithGoogle()
    expect(calls).toEqual(['google'])
    expect(useAuth.getState().error).toMatch(/not switched on/)
  })
})

describe('entering as a guest', () => {
  it('asks the backend for a new account, once, and says what went wrong if it cannot', async () => {
    const { backend, calls } = fakeBackend({ guest: { ok: false, message: 'Guest access is not switched on yet.' } })
    setAuthBackend(backend)
    await Promise.all([useAuth.getState().signInAsGuest(), useAuth.getState().signInAsGuest()])
    expect(calls).toEqual(['guest'])
    expect(useAuth.getState().error).toBe('Guest access is not switched on yet.')
    expect(useAuth.getState().busy).toBe(false)
  })
})

describe('making an account', () => {
  it('tells the founder to open the link that was sent, naming the address, and is not signed in until they do', async () => {
    setAuthBackend(fakeBackend({ signUp: { ok: true, needsConfirmation: true } }).backend)
    await useAuth.getState().signUp({ name: 'Megan', email: ' megan@example.com ', password: 'longenough' })
    expect(useAuth.getState().notice).toBe('We sent a link to megan@example.com. Open it to finish making your account.')
    expect(useAuth.getState().status).toBe('loading')
  })

  it('says nothing more when there was no need to confirm, since the session arrives by itself', async () => {
    setAuthBackend(fakeBackend({ signUp: { ok: true, needsConfirmation: false } }).backend)
    await useAuth.getState().signUp({ name: 'Megan', email: 'megan@example.com', password: 'longenough' })
    expect(useAuth.getState()).toMatchObject({ notice: '', error: '' })
  })

  it('shows an account that already exists as an error, not a notice', async () => {
    setAuthBackend(fakeBackend({ signUp: { ok: false, message: 'There is already an account with that email. Try signing in.' } }).backend)
    await useAuth.getState().signUp({ name: 'Megan', email: 'megan@example.com', password: 'longenough' })
    expect(useAuth.getState()).toMatchObject({ error: expect.stringMatching(/already an account/), notice: '' })
  })
})

describe('signing out', () => {
  it('ends the session, goes back to this browser\'s storage and says nobody is signed in', async () => {
    const { backend, calls, storage } = fakeBackend({ user: megan })
    setAuthBackend(backend)
    start()
    await vi.waitFor(() => expect(documentStorage()).toBe(storage))
    await useAuth.getState().signOut()
    expect(calls).toContain('signOut')
    expect(useAuth.getState()).toMatchObject({ status: 'signedOut', user: null })
    expect(documentStorage()).toBe(localDocumentStorage)
  })

  it('changes nothing on this device alone, where there is no account to leave', async () => {
    const { backend } = fakeBackend({ user: megan, kind: 'local' })
    setAuthBackend({ ...backend, storage: localDocumentStorage })
    start()
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('signedIn'))
    await useAuth.getState().signOut()
    expect(useAuth.getState().status).toBe('signedIn')
  })
})

describe('finishing the introduction', () => {
  const fresh: AuthUser = { ...megan, onboarded: false }

  it('marks the founder as introduced at once, and asks the backend to remember it', async () => {
    const { backend, calls } = fakeBackend({ user: fresh })
    setAuthBackend(backend)
    start()
    await vi.waitFor(() => expect(useAuth.getState().user).toEqual(fresh))
    await useAuth.getState().completeOnboarding()
    expect(useAuth.getState().user?.onboarded).toBe(true)
    expect(calls).toEqual(['completeOnboarding'])
  })

  it('does not hold them up when it could not be remembered: they carry on, and are not sent back by a session event that still has the old account', async () => {
    const { backend, emit } = fakeBackend({ user: fresh, onboardingSaved: false })
    setAuthBackend(backend)
    start()
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('signedIn'))
    await useAuth.getState().completeOnboarding()
    emit(fresh)
    expect(useAuth.getState().user?.onboarded).toBe(true)
  })

  it('asks nothing of the backend for someone who has been through it, or for nobody', async () => {
    const { backend, calls } = fakeBackend({ user: megan })
    setAuthBackend(backend)
    start()
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('signedIn'))
    await useAuth.getState().completeOnboarding()
    useAuth.setState({ user: null })
    await useAuth.getState().completeOnboarding()
    expect(calls).toEqual([])
  })
})


describe('deleting the account', () => {
  it('signs the founder out, goes back to this browser\'s storage and leaves a notice for the sign-in screen', async () => {
    const { backend, calls, storage } = fakeBackend({ user: megan })
    setAuthBackend(backend)
    start()
    await vi.waitFor(() => expect(documentStorage()).toBe(storage))
    expect(await useAuth.getState().deleteAccount()).toBe(true)
    expect(calls).toContain('deleteAccount')
    expect(useAuth.getState()).toMatchObject({ status: 'signedOut', user: null, busy: false, error: '', notice: 'Your account and everything in it has been deleted.' })
    expect(documentStorage()).toBe(localDocumentStorage)
  })

  it('keeps the founder signed in and says what went wrong when it could not be done', async () => {
    const { backend } = fakeBackend({ user: megan, deleteAccount: { ok: false, message: 'Your account could not be deleted. Try again in a moment.' } })
    setAuthBackend(backend)
    start()
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('signedIn'))
    expect(await useAuth.getState().deleteAccount()).toBe(false)
    expect(useAuth.getState()).toMatchObject({ status: 'signedIn', busy: false, error: 'Your account could not be deleted. Try again in a moment.', notice: '' })
  })

  it('says it in the app\'s words when the backend itself fails', async () => {
    const { backend } = fakeBackend({ user: megan })
    setAuthBackend({ ...backend, deleteAccount: async () => { throw new Error('boom: service detail') } })
    start()
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('signedIn'))
    expect(await useAuth.getState().deleteAccount()).toBe(false)
    expect(useAuth.getState().error).toBe('Your account could not be deleted. Try again in a moment.')
  })

  it('ignores a second press while the first is still working', async () => {
    const { backend, calls } = fakeBackend({ user: megan })
    setAuthBackend(backend)
    start()
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('signedIn'))
    const first = useAuth.getState().deleteAccount()
    expect(await useAuth.getState().deleteAccount()).toBe(false)
    await first
    expect(calls.filter((call) => call === 'deleteAccount')).toHaveLength(1)
  })

  it('on this device alone keeps the sample founder where they are and sets no sign-in notice', async () => {
    const { backend, calls } = fakeBackend({ user: megan, kind: 'local' })
    setAuthBackend({ ...backend, storage: localDocumentStorage })
    start()
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('signedIn'))
    expect(await useAuth.getState().deleteAccount()).toBe(true)
    expect(calls).toContain('deleteAccount')
    expect(useAuth.getState()).toMatchObject({ status: 'signedIn', busy: false, notice: '' })
  })
})

describe('coming back from Google with an error', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('says what went wrong on the sign-in screen and takes it out of the address', async () => {
    window.history.replaceState(null, '', '/home?error=access_denied&error_description=The+user+denied+access')
    setAuthBackend(fakeBackend({ user: null }).backend)
    start()
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('signedOut'))
    expect(useAuth.getState().error).toBe('Signing in with Google was cancelled or not allowed for that account. Try again, or use your email and a password.')
    expect(window.location.search).toBe('')
  })

  it('says nothing when the address carries no error', async () => {
    window.history.replaceState(null, '', '/home')
    setAuthBackend(fakeBackend({ user: null }).backend)
    start()
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('signedOut'))
    expect(useAuth.getState().error).toBe('')
  })
})
