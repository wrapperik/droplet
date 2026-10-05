import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AuthBackend, AuthUser } from '../lib/auth.ts'
import { documentStorage, setDocumentStorage, type DocumentStorage } from '../lib/storage.ts'
import { slowMemoryStorage } from '../test/slowStorage.ts'
import { setAuthBackend, useAuth } from '../store/auth.ts'
import RequireAuth from './RequireAuth.tsx'

const backend = (user: AuthUser | null, delayMs = 0): AuthBackend => ({
  kind: 'supabase',
  storage: slowMemoryStorage(1).driver,
  currentUser: () => new Promise((resolve) => setTimeout(() => resolve(user), delayMs)),
  onChange: () => () => {},
  signIn: async () => ({ ok: true }),
  signUp: async () => ({ ok: true }),
  signInWithGoogle: async () => ({ ok: true }),
  signOut: async () => {},
})

let before: DocumentStorage
beforeEach(() => {
  before = documentStorage()
  useAuth.setState({ status: 'loading', user: null, busy: false, error: '', notice: '' })
})
afterEach(() => {
  setAuthBackend(null)
  setDocumentStorage(before)
})

const renderGuarded = () =>
  render(
    <MemoryRouter initialEntries={['/home']}>
      <Routes>
        <Route path="/sign-in" element={<p>Sign in here</p>} />
        <Route path="/home" element={<RequireAuth><p>The private app</p></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  )

describe('RequireAuth', () => {
  it('shows nothing, and nothing private, while it looks for the session', async () => {
    setAuthBackend(backend({ id: 'u1', email: 'm@example.com', name: 'Megan' }, 30))
    renderGuarded()
    expect(screen.getByRole('status', { name: 'Signing you in' })).toBeInTheDocument()
    expect(screen.queryByText('The private app')).not.toBeInTheDocument()
    expect(screen.queryByText('Sign in here')).not.toBeInTheDocument()
    expect(await screen.findByText('The private app')).toBeInTheDocument()
  })

  it('sends someone who is not signed in to sign in, and never shows what is behind it', async () => {
    setAuthBackend(backend(null))
    renderGuarded()
    expect(await screen.findByText('Sign in here')).toBeInTheDocument()
    expect(screen.queryByText('The private app')).not.toBeInTheDocument()
  })

  it('lets a signed-in founder through', async () => {
    setAuthBackend(backend({ id: 'u1', email: 'm@example.com', name: 'Megan' }))
    renderGuarded()
    expect(await screen.findByText('The private app')).toBeInTheDocument()
  })
})
