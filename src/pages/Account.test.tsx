import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localAuthBackend, type AuthBackend } from '../lib/auth.ts'
import { setAuthBackend, useAuth } from '../store/auth.ts'
import Account from './Account.tsx'

const signOut = vi.fn(async () => {})
const account = (kind: 'local' | 'supabase') => setAuthBackend({ ...localAuthBackend, kind } as AuthBackend)

beforeEach(() => {
  signOut.mockClear()
  useAuth.setState({ status: 'signedIn', user: { id: 'u1', email: 'megan@example.com', name: 'Megan', onboarded: true }, signOut })
  account('supabase')
})
afterEach(() => {
  setAuthBackend(null)
  useAuth.setState({ status: 'loading', user: null })
})

const renderAccount = () =>
  render(
    <MemoryRouter initialEntries={['/account']}>
      <Routes>
        <Route path="/account" element={<Account />} />
        <Route path="/home" element={<p>The app</p>} />
        <Route path="/welcome" element={<p>The introduction</p>} />
        <Route path="/sign-in" element={<p>Sign in here</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('the account page', () => {
  it('says who is signed in, by name and email, and where their work is kept', () => {
    renderAccount()
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument()
    expect(screen.getByText('Megan')).toBeInTheDocument()
    expect(screen.getByText('megan@example.com')).toBeInTheDocument()
    expect(screen.getByText(/In your Droplet account/)).toBeInTheDocument()
  })

  it('goes back to the app', async () => {
    const user = userEvent.setup()
    renderAccount()
    await user.click(screen.getByRole('link', { name: 'Back to Droplet' }))
    expect(screen.getByText('The app')).toBeInTheDocument()
  })

  it('restarts the introduction, which changes nothing about the account', async () => {
    const user = userEvent.setup()
    renderAccount()
    await user.click(screen.getByRole('button', { name: 'Restart introduction' }))
    expect(screen.getByText('The introduction')).toBeInTheDocument()
    expect(useAuth.getState().user?.onboarded).toBe(true)
  })

  it('signs out and goes to the sign-in screen', async () => {
    const user = userEvent.setup()
    renderAccount()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Sign in here')).toBeInTheDocument()
  })

  it('on this device alone says so, has no email to show and no one to sign out', () => {
    account('local')
    renderAccount()
    expect(screen.getByText('This device only')).toBeInTheDocument()
    expect(screen.getByText(/In this browser, on this device/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restart introduction' })).toBeInTheDocument()
  })
})
