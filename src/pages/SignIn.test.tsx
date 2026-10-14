import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AuthBackend, AuthResult, AuthUser } from '../lib/auth.ts'
import { documentStorage, setDocumentStorage, type DocumentStorage } from '../lib/storage.ts'
import { slowMemoryStorage } from '../test/slowStorage.ts'
import { setAuthBackend, useAuth } from '../store/auth.ts'
import SignIn from './SignIn.tsx'

const calls: { method: string; input?: unknown }[] = []
let results: { signIn?: AuthResult; signUp?: AuthResult; google?: AuthResult } = {}
let current: AuthUser | null = null

const backend = (): AuthBackend => ({
  kind: 'supabase',
  storage: slowMemoryStorage(1).driver,
  currentUser: async () => current,
  onChange: () => () => {},
  signIn: async (input) => {
    calls.push({ method: 'signIn', input })
    return results.signIn ?? { ok: true }
  },
  signUp: async (input) => {
    calls.push({ method: 'signUp', input })
    return results.signUp ?? { ok: true, needsConfirmation: true }
  },
  signInWithGoogle: async () => {
    calls.push({ method: 'google' })
    return results.google ?? { ok: true }
  },
  signOut: async () => {},
  completeOnboarding: async () => true,
  deleteAccount: async () => ({ ok: true as const }),
})

let before: DocumentStorage
beforeEach(() => {
  calls.length = 0
  results = {}
  current = null
  before = documentStorage()
  setAuthBackend(backend())
  useAuth.setState({ status: 'loading', user: null, busy: false, error: '', notice: '' })
})
afterEach(() => {
  setAuthBackend(null)
  setDocumentStorage(before)
})

const renderSignIn = (entry = '/sign-in') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/home" element={<p>The app</p>} />
      </Routes>
    </MemoryRouter>,
  )

const type = async (user: ReturnType<typeof userEvent.setup>, label: string, text: string) => user.type(screen.getByLabelText(label), text)

describe('the sign-in screen', () => {
  it('is one standard screen: email, password, a way to make an account, and Google', () => {
    renderSignIn()
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in to Droplet' })).toHaveAttribute('type', 'submit')
    // the two halves of the mode control are named differently from the button that sends the form
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(screen.queryByLabelText('What should we call you?')).not.toBeInTheDocument()
  })

  it('opens on making an account when the address says so (a sign-up link)', () => {
    renderSignIn('/sign-in?mode=sign-up')
    expect(screen.getByRole('heading', { name: 'Make your account' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make an account' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('What should we call you?')).toBeInTheDocument()
  })

  it('opens on signing in for ?mode=sign-in, and for a mode it does not know', () => {
    const { unmount } = renderSignIn('/sign-in?mode=sign-in')
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    unmount()
    renderSignIn('/sign-in?mode=nonsense')
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('asks for a name too when making an account, and says how long a password must be', async () => {
    const user = userEvent.setup()
    renderSignIn()
    await user.click(screen.getByRole('button', { name: 'Make an account' }))
    expect(screen.getByRole('heading', { name: 'Make your account' })).toBeInTheDocument()
    expect(screen.getByLabelText('What should we call you?')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('At least 8 characters.')
    expect(screen.getByRole('button', { name: 'Make my account' })).toBeInTheDocument()
  })

  it('tells the founder what is wrong with what they typed, in words, and sends nothing', async () => {
    const user = userEvent.setup()
    renderSignIn()
    await user.click(screen.getByRole('button', { name: 'Sign in to Droplet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your email address.')
    await type(user, 'Email', 'megan@')
    await user.click(screen.getByRole('button', { name: 'Sign in to Droplet' }))
    expect(screen.getByRole('alert')).toHaveTextContent('That does not look like an email address.')
    expect(calls).toEqual([])
  })

  it('signs in with what was typed', async () => {
    const user = userEvent.setup()
    renderSignIn()
    await type(user, 'Email', 'megan@example.com')
    await type(user, 'Password', 'a long password')
    await user.click(screen.getByRole('button', { name: 'Sign in to Droplet' }))
    await waitFor(() => expect(calls).toEqual([{ method: 'signIn', input: { email: 'megan@example.com', password: 'a long password' } }]))
  })

  it('shows what went wrong from the service in the app\'s words, and keeps what was typed', async () => {
    const user = userEvent.setup()
    results = { signIn: { ok: false, message: 'That email and password do not match.' } }
    renderSignIn()
    await type(user, 'Email', 'megan@example.com')
    await type(user, 'Password', 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in to Droplet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That email and password do not match.')
    expect(screen.getByLabelText('Email')).toHaveValue('megan@example.com')
  })

  it('makes an account with the name, and tells the founder to open the link that was sent', async () => {
    const user = userEvent.setup()
    renderSignIn()
    await user.click(screen.getByRole('button', { name: 'Make an account' }))
    await type(user, 'What should we call you?', 'Megan')
    await type(user, 'Email', 'megan@example.com')
    await type(user, 'Password', 'a long password')
    await user.click(screen.getByRole('button', { name: 'Make my account' }))
    expect(await screen.findByRole('status')).toHaveTextContent('We sent a link to megan@example.com. Open it to finish making your account.')
    expect(calls).toEqual([{ method: 'signUp', input: { name: 'Megan', email: 'megan@example.com', password: 'a long password' } }])
  })

  it('holds a new password to eight characters before asking the service', async () => {
    const user = userEvent.setup()
    renderSignIn()
    await user.click(screen.getByRole('button', { name: 'Make an account' }))
    await type(user, 'What should we call you?', 'Megan')
    await type(user, 'Email', 'megan@example.com')
    await type(user, 'Password', 'short')
    await user.click(screen.getByRole('button', { name: 'Make my account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Use at least 8 characters for your password.')
    expect(calls).toEqual([])
  })

  it('goes to Google', async () => {
    const user = userEvent.setup()
    renderSignIn()
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }))
    await waitFor(() => expect(calls).toEqual([{ method: 'google' }]))
  })

  it('clears a message when the founder switches between signing in and making an account', async () => {
    const user = userEvent.setup()
    renderSignIn()
    await user.click(screen.getByRole('button', { name: 'Sign in to Droplet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your email address.')
    await user.click(screen.getByRole('button', { name: 'Make an account' }))
    expect(screen.getByRole('alert', { hidden: true })).toHaveTextContent('')
  })

  it('sends someone who is already signed in on to the app, once the session has been found', async () => {
    current = { id: 'u1', email: 'megan@example.com', name: 'Megan', onboarded: true }
    renderSignIn()
    expect(await screen.findByText('The app')).toBeInTheDocument()
  })

  it('disables the buttons while something is being sent, so nothing is sent twice', async () => {
    const user = userEvent.setup()
    renderSignIn()
    await type(user, 'Email', 'megan@example.com')
    await type(user, 'Password', 'pw')
    act(() => useAuth.setState({ busy: true }))
    expect(await screen.findByRole('button', { name: 'One moment' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled()
  })
})

describe('continuing with Google', () => {
  it('says it is opening Google while it does, without the email button saying it is busy', async () => {
    let finish: (result: AuthResult) => void = () => {}
    setAuthBackend({ ...backend(), signInWithGoogle: () => new Promise<AuthResult>((resolve) => (finish = resolve)) })
    renderSignIn()
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(screen.getByRole('button', { name: 'Opening Google' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sign in to Droplet' })).toBeDisabled()
    await act(async () => finish({ ok: false, message: 'Signing in with Google is not switched on yet.' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Signing in with Google is not switched on yet.')
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()
  })

  it('shows what went wrong when Google sent the founder back with an error', async () => {
    useAuth.setState({ error: 'Signing in with Google was cancelled or not allowed for that account. Try again, or use your email and a password.' })
    renderSignIn()
    expect(await screen.findByRole('alert')).toHaveTextContent('Signing in with Google was cancelled')
  })
})
