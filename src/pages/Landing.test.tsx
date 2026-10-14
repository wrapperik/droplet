import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { STARTER_PALETTE } from '../compose/fallback.ts'
import { contrastRatio, hexToRgb } from '../lib/colour.ts'
import { DOES, FOOTER, HERO, NOT_YET, TRUST } from '../lib/landing.ts'
import type { AuthBackend } from '../lib/auth.ts'
import { setAuthBackend, useAuth } from '../store/auth.ts'
import Landing from './Landing.tsx'

// A backend that never finds a session, so the status set by a test is not overwritten when the page looks for one.
const quiet: AuthBackend = {
  kind: 'supabase',
  storage: {} as AuthBackend['storage'],
  currentUser: () => new Promise(() => {}),
  onChange: () => () => {},
  signIn: async () => ({ ok: true }),
  signUp: async () => ({ ok: true }),
  signInWithGoogle: async () => ({ ok: true }),
  signOut: async () => {},
  completeOnboarding: async () => true,
  deleteAccount: async () => ({ ok: true as const }),
}

beforeEach(() => setAuthBackend(quiet))
afterEach(() => {
  setAuthBackend(null)
  useAuth.setState({ status: 'loading', user: null })
})

const renderLanding = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/home" element={<p>The app</p>} />
        <Route path="/sign-in" element={<p>Sign in here</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('the landing page', () => {
  beforeEach(() => useAuth.setState({ status: 'signedOut', user: null }))

  it('has one h1, in the landmarks a page needs', () => {
    renderLanding()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: HERO.title })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toHaveTextContent(FOOTER)
  })

  it('leads to making an account and to signing in', () => {
    renderLanding()
    expect(screen.getByRole('link', { name: /Make an account/ })).toHaveAttribute('href', '/sign-in?mode=sign-up')
    const signIns = screen.getAllByRole('link', { name: 'Sign in' })
    expect(signIns).toHaveLength(2)
    for (const link of signIns) expect(link).toHaveAttribute('href', '/sign-in')
    // one in the header, one in the hero
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('compares a chat reply with a workspace, and works the contrast out in code', () => {
    renderLanding()
    expect(screen.getByRole('heading', { level: 3, name: 'A chat reply' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'A Droplet workspace' })).toBeInTheDocument()
    const hexOf = (role: string) => STARTER_PALETTE.find((colour) => colour.role === role)!.hex
    const ratio = contrastRatio(hexToRgb(hexOf('text')), hexToRgb(hexOf('background')))
    expect(screen.getByText(`${ratio.toFixed(1)}:1`)).toBeInTheDocument()
  })

  it('lists only what exists, with logos and client emails as next, and keeps the pictures out of the accessibility tree', () => {
    const { container } = renderLanding()
    for (const item of DOES.live) expect(screen.getByRole('heading', { level: 3, name: item.title })).toBeInTheDocument()
    const planned = screen.getByRole('list', { name: 'Planned' })
    expect(within(planned).getAllByRole('listitem')).toHaveLength(DOES.next.length)
    expect(planned).toHaveTextContent('Get a logo')
    expect(planned).toHaveTextContent('Write to a client')
    expect(container.querySelectorAll('.landing__picture[aria-hidden="true"]')).toHaveLength(2)
  })

  it('says what it keeps true and who it is not for yet', () => {
    renderLanding()
    for (const point of [...TRUST.points, ...NOT_YET.points]) expect(screen.getByText(point)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: NOT_YET.title })).toBeInTheDocument()
  })
})

describe('the landing page and the session', () => {
  it('draws nothing while the session is looked for, so a signed-in founder never sees it flash', () => {
    useAuth.setState({ status: 'loading', user: null })
    renderLanding()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('sends a founder who is signed in on to the app', () => {
    useAuth.setState({ status: 'signedIn', user: { id: 'u1', email: 'm@example.com', name: 'Megan', onboarded: true } })
    renderLanding()
    expect(screen.getByText('The app')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })
})
