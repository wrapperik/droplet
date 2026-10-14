import { describe, expect, it, vi } from 'vitest'
import { checkCredentials, createSupabaseAuthBackend, displayNameOf, friendlyAuthError, localAuthBackend, MIN_PASSWORD, type SupabaseAuthClient } from './auth.ts'
import { localDocumentStorage, removeAllLocalDocuments } from './storage.ts'

describe('checkCredentials', () => {
  const ok = { name: 'Megan', email: 'megan@example.com', password: 'longenough' }

  it('accepts good details for both, and does not ask for a name when signing in', () => {
    expect(checkCredentials('sign-up', ok)).toBeNull()
    expect(checkCredentials('sign-in', { email: ok.email, password: 'x' })).toBeNull()
  })

  it('asks for what is missing, in the order it is asked on the screen, in plain words', () => {
    expect(checkCredentials('sign-up', { ...ok, name: '  ' })).toBe('Tell us what to call you.')
    expect(checkCredentials('sign-in', { ...ok, email: '' })).toBe('Enter your email address.')
    expect(checkCredentials('sign-in', { ...ok, email: 'megan@' })).toBe('That does not look like an email address.')
    expect(checkCredentials('sign-in', { ...ok, email: 'megan example.com' })).toBe('That does not look like an email address.')
    expect(checkCredentials('sign-in', { ...ok, password: '' })).toBe('Enter your password.')
  })

  it('holds a new password to a length, but not one that already exists (it was made under whatever rule there was)', () => {
    expect(checkCredentials('sign-up', { ...ok, password: 'a'.repeat(MIN_PASSWORD - 1) })).toBe(`Use at least ${MIN_PASSWORD} characters for your password.`)
    expect(checkCredentials('sign-up', { ...ok, password: 'a'.repeat(MIN_PASSWORD) })).toBeNull()
    expect(checkCredentials('sign-in', { ...ok, password: 'short' })).toBeNull()
  })
})

describe('friendlyAuthError', () => {
  it('turns what a service says into the app\'s own words', () => {
    expect(friendlyAuthError('Invalid login credentials')).toBe('That email and password do not match.')
    expect(friendlyAuthError('User already registered')).toMatch(/already an account/)
    expect(friendlyAuthError('Email not confirmed')).toMatch(/Confirm your email/)
    expect(friendlyAuthError('email rate limit exceeded')).toMatch(/Too many tries/)
    expect(friendlyAuthError('Password should be at least 6 characters')).toMatch(/at least 8 characters/)
    expect(friendlyAuthError('Failed to fetch')).toMatch(/Could not reach the server/)
    expect(friendlyAuthError('Unsupported provider: provider is not enabled')).toMatch(/Google is not switched on/)
  })

  it('says something plain and kind for anything it does not know, without repeating the service\'s wording', () => {
    expect(friendlyAuthError('PGRST301 jwt expired at 0x7f')).toBe('Something went wrong. Try again in a moment.')
    expect(friendlyAuthError('')).toBe('Something went wrong. Try again in a moment.')
  })
})

describe('displayNameOf', () => {
  it('prefers the name they gave, then the one Google gave, then the start of their email', () => {
    expect(displayNameOf({ display_name: ' Megan ', full_name: 'Megan Swart' }, 'm@example.com')).toBe('Megan')
    expect(displayNameOf({ full_name: 'Megan Swart' }, 'm@example.com')).toBe('Megan Swart')
    expect(displayNameOf({ name: 'Meg' }, 'm@example.com')).toBe('Meg')
    expect(displayNameOf({}, 'megan.swart@example.com')).toBe('megan.swart')
    expect(displayNameOf(undefined, undefined)).toBe('You')
  })

  it('ignores a name that is not text or is empty, and keeps one to the length the database allows', () => {
    expect(displayNameOf({ display_name: 12, full_name: '   ' }, 'x@example.com')).toBe('x')
    expect(displayNameOf({ display_name: 'a'.repeat(200) }, '')).toHaveLength(80)
  })
})

describe('the sign-in for this device alone', () => {
  it('is always signed in as the sample founder, and keeps documents in this browser', async () => {
    expect(await localAuthBackend.currentUser()).toMatchObject({ name: 'Megan' })
    expect(localAuthBackend.storage).toBe(localDocumentStorage)
    expect(await localAuthBackend.signIn({ email: '', password: '' })).toEqual({ ok: true })
  })
})

// A stand-in for the Supabase client: what it answers is what a test sets, and what it was asked is kept.
function fakeClient(answers: Partial<{ signUp: unknown; signIn: unknown; oauth: unknown; session: unknown; update: unknown }> = {}) {
  const asked: { method: string; input?: unknown }[] = []
  let listener: ((event: string, session: unknown) => void) | null = null
  const unsubscribe = vi.fn()
  const client = {
    from: () => ({ select: () => ({}), upsert: () => ({}), delete: () => ({}) }),
    auth: {
      getSession: async () => ({ data: { session: (answers.session ?? null) as never } }),
      onAuthStateChange: (callback: typeof listener) => {
        listener = callback
        return { data: { subscription: { unsubscribe } } }
      },
      signUp: async (input: unknown) => {
        asked.push({ method: 'signUp', input })
        return (answers.signUp ?? { data: { user: { id: 'u1', email: 'm@example.com' }, session: { x: 1 } }, error: null }) as never
      },
      signInWithPassword: async (input: unknown) => {
        asked.push({ method: 'signIn', input })
        return (answers.signIn ?? { data: { user: null, session: null }, error: null }) as never
      },
      signInWithOAuth: async (input: unknown) => {
        asked.push({ method: 'oauth', input })
        return (answers.oauth ?? { error: null }) as never
      },
      signOut: async (input?: unknown) => {
        asked.push({ method: 'signOut', input })
        return { error: null }
      },
      updateUser: async (input: unknown) => {
        asked.push({ method: 'updateUser', input })
        return (answers.update ?? { error: null }) as never
      },
    },
  } as unknown as SupabaseAuthClient
  return { client, asked, emit: (event: string, session: unknown) => listener?.(event, session), unsubscribe }
}

describe('the sign-in with Supabase', () => {
  it('knows who is signed in from the session, by the name they gave', async () => {
    const { client } = fakeClient({ session: { user: { id: 'u1', email: 'm@example.com', user_metadata: { display_name: 'Megan' } } } })
    expect(await createSupabaseAuthBackend(client).currentUser()).toEqual({ id: 'u1', email: 'm@example.com', name: 'Megan', onboarded: false })
  })

  it('knows nobody is signed in when there is no session, and when the service cannot be reached', async () => {
    expect(await createSupabaseAuthBackend(fakeClient().client).currentUser()).toBeNull()
    const broken = fakeClient().client
    broken.auth.getSession = async () => {
      throw new Error('offline')
    }
    expect(await createSupabaseAuthBackend(broken).currentUser()).toBeNull()
  })

  it('is told when someone signs in or out, and stops listening when asked', () => {
    const { client, emit, unsubscribe } = fakeClient()
    const seen: unknown[] = []
    const stop = createSupabaseAuthBackend(client).onChange((user) => seen.push(user))
    emit('SIGNED_IN', { user: { id: 'u1', email: 'm@example.com' } })
    emit('SIGNED_OUT', null)
    expect(seen).toEqual([{ id: 'u1', email: 'm@example.com', name: 'm', onboarded: false }, null])
    stop()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('makes an account with the name kept for the profile, the email tidied, and the way back to the app', async () => {
    const { client, asked } = fakeClient()
    const result = await createSupabaseAuthBackend(client).signUp({ name: ' Megan ', email: ' m@example.com ', password: 'longenough' })
    expect(result).toEqual({ ok: true, needsConfirmation: false })
    expect(asked[0].input).toEqual({ email: 'm@example.com', password: 'longenough', options: { data: { display_name: 'Megan' }, emailRedirectTo: `${window.location.origin}/home` } })
  })

  it('says the email must be confirmed when the account was made but there is no session yet', async () => {
    const { client } = fakeClient({ signUp: { data: { user: { id: 'u1', email: 'm@example.com', identities: [{}] }, session: null }, error: null } })
    expect(await createSupabaseAuthBackend(client).signUp({ name: 'M', email: 'm@example.com', password: 'longenough' })).toEqual({ ok: true, needsConfirmation: true })
  })

  it('says there is already an account when the service answers as if it made one but with no sign-in methods on it', async () => {
    const { client } = fakeClient({ signUp: { data: { user: { id: 'u1', identities: [] }, session: null }, error: null } })
    const result = await createSupabaseAuthBackend(client).signUp({ name: 'M', email: 'm@example.com', password: 'longenough' })
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/already an account/) })
  })

  it('signs in with the email tidied, and says in the app\'s words when the details are wrong', async () => {
    const good = fakeClient()
    expect(await createSupabaseAuthBackend(good.client).signIn({ email: ' m@example.com ', password: 'pw' })).toEqual({ ok: true })
    expect(good.asked[0].input).toEqual({ email: 'm@example.com', password: 'pw' })
    const bad = fakeClient({ signIn: { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } } })
    expect(await createSupabaseAuthBackend(bad.client).signIn({ email: 'm@example.com', password: 'nope' })).toEqual({ ok: false, message: 'That email and password do not match.' })
  })

  it('goes to Google and asks to be sent back to the app', async () => {
    const { client, asked } = fakeClient()
    expect(await createSupabaseAuthBackend(client).signInWithGoogle()).toEqual({ ok: true })
    expect(asked[0].input).toEqual({ provider: 'google', options: { redirectTo: `${window.location.origin}/home` } })
  })

  it('does not throw when the service cannot be reached: it says so', async () => {
    const { client } = fakeClient()
    client.auth.signInWithPassword = async () => {
      throw new Error('Failed to fetch')
    }
    expect(await createSupabaseAuthBackend(client).signIn({ email: 'm@example.com', password: 'pw' })).toMatchObject({ ok: false, message: expect.stringMatching(/Could not reach the server/) })
  })

  it('keeps a signed-in founder\'s documents in Supabase, not in this browser', () => {
    const backend = createSupabaseAuthBackend(fakeClient().client)
    expect(backend.kind).toBe('supabase')
    expect(backend.storage).not.toBe(localDocumentStorage)
  })

  it('signs out through the service', async () => {
    const { client, asked } = fakeClient()
    await createSupabaseAuthBackend(client).signOut()
    expect(asked.map((call) => call.method)).toEqual(['signOut'])
  })
})

describe('the introduction, kept in the account', () => {
  it('is read from the account\'s own metadata: only a plain true counts', async () => {
    for (const [metadata, expected] of [[{ onboarded: true }, true], [{ onboarded: 'true' }, false], [{}, false], [undefined, false]] as const) {
      const { client } = fakeClient({ session: { user: { id: 'u1', email: 'm@example.com', user_metadata: metadata } } })
      expect((await createSupabaseAuthBackend(client).currentUser())?.onboarded, JSON.stringify(metadata)).toBe(expected)
    }
  })

  it('is written to the account\'s metadata, and says whether that worked', async () => {
    const { client, asked } = fakeClient()
    expect(await createSupabaseAuthBackend(client).completeOnboarding()).toBe(true)
    expect(asked).toEqual([{ method: 'updateUser', input: { data: { onboarded: true } } }])
    expect(await createSupabaseAuthBackend(fakeClient({ update: { error: { message: 'offline' } } }).client).completeOnboarding()).toBe(false)
    const broken = fakeClient().client
    broken.auth.updateUser = async () => {
      throw new Error('offline')
    }
    expect(await createSupabaseAuthBackend(broken).completeOnboarding()).toBe(false)
  })

  it('is already done on this device alone, where there is no account to introduce', async () => {
    expect(await localAuthBackend.currentUser()).toMatchObject({ onboarded: true })
    expect(await localAuthBackend.completeOnboarding()).toBe(true)
  })
})


describe('deleting the account', () => {
  const session = { user: { id: 'u1', email: 'm@example.com' }, access_token: 'the-founders-token' }
  const config = (fetchImpl: typeof fetch) => ({ url: 'https://abc.supabase.co/', key: 'publishable', fetch: fetchImpl })

  it('asks the function with the founder\'s own token and the publishable key, then ends the session on this device only', async () => {
    const { client, asked } = fakeClient({ session })
    const fetchImpl = vi.fn(async () => new Response('{"deleted":true}', { status: 200 }))
    const result = await createSupabaseAuthBackend(client, config(fetchImpl as unknown as typeof fetch)).deleteAccount()
    expect(result).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledWith('https://abc.supabase.co/functions/v1/delete-account', { method: 'POST', headers: { authorization: 'Bearer the-founders-token', apikey: 'publishable' } })
    expect(asked).toEqual([{ method: 'signOut', input: { scope: 'local' } }])
  })

  it('does not call the function, or sign anyone out, with no session', async () => {
    const { client, asked } = fakeClient()
    const fetchImpl = vi.fn()
    const result = await createSupabaseAuthBackend(client, config(fetchImpl as unknown as typeof fetch)).deleteAccount()
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('Sign in again') })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(asked).toEqual([])
  })

  it('says plainly when the session has ended or the server could not do it, in the app\'s words, and signs nobody out', async () => {
    for (const [status, text] of [[401, 'Sign in again'], [500, 'could not be deleted'], [404, 'could not be deleted']] as const) {
      const { client, asked } = fakeClient({ session })
      const fetchImpl = async () => new Response('{"message":"secret service detail"}', { status })
      const result = await createSupabaseAuthBackend(client, config(fetchImpl as unknown as typeof fetch)).deleteAccount()
      expect(result.ok).toBe(false)
      expect(result.ok === false && result.message).toContain(text)
      expect(result.ok === false && result.message).not.toContain('secret')
      expect(asked).toEqual([])
    }
  })

  it('says so when the server cannot be reached', async () => {
    const { client } = fakeClient({ session })
    const fetchImpl = async () => {
      throw new TypeError('Failed to fetch')
    }
    expect(await createSupabaseAuthBackend(client, config(fetchImpl as unknown as typeof fetch)).deleteAccount()).toEqual({ ok: false, message: 'Could not reach the server. Check your connection and try again.' })
  })

  it('on this device alone removes every project\'s saved documents, and nothing else of the device\'s', async () => {
    window.localStorage.setItem('droplet-project-duckstack-palette', '{}')
    window.localStorage.setItem('droplet-project-local-abc-chats', '[]')
    window.localStorage.setItem('droplet-theme', 'dark')
    expect(await localAuthBackend.deleteAccount()).toEqual({ ok: true })
    expect(window.localStorage.getItem('droplet-project-duckstack-palette')).toBeNull()
    expect(window.localStorage.getItem('droplet-project-local-abc-chats')).toBeNull()
    expect(window.localStorage.getItem('droplet-theme')).toBe('dark')
    window.localStorage.removeItem('droplet-theme')
    expect(removeAllLocalDocuments()).toBe(true)
  })
})
