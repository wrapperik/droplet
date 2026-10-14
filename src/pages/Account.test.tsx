import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localAuthBackend, type AuthBackend } from '../lib/auth.ts'
import { setAuthBackend, useAuth } from '../store/auth.ts'
import Account from './Account.tsx'

const signOut = vi.fn(async () => {})
const deleteAccount = vi.fn(async () => true)
const account = (kind: 'local' | 'supabase') => setAuthBackend({ ...localAuthBackend, kind } as AuthBackend)

beforeEach(() => {
  signOut.mockClear()
  deleteAccount.mockReset()
  deleteAccount.mockResolvedValue(true)
  useAuth.setState({ status: 'signedIn', user: { id: 'u1', email: 'megan@example.com', name: 'Megan', onboarded: true }, signOut, deleteAccount, busy: false, error: '', notice: '' })
  account('supabase')
})
afterEach(() => {
  setAuthBackend(null)
  useAuth.setState({ status: 'loading', user: null, busy: false, error: '', notice: '' })
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

describe('deleting the account and data', () => {
  it('is always visible at the bottom of the page, and asks nothing until it is pressed', () => {
    renderAccount()
    expect(screen.getByRole('heading', { level: 2, name: 'Delete account and data' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete account and data' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Delete everything' })).not.toBeInTheDocument()
  })

  it('says exactly what will go, that it cannot be undone, and keeps the final button off until the email is typed', async () => {
    const user = userEvent.setup()
    renderAccount()
    await user.click(screen.getByRole('button', { name: 'Delete account and data' }))
    const panel = screen.getByRole('form', { name: 'This will delete, for good:' })
    for (const text of [/Every project/, /palette, board, invoice, client and chat/, /Droplet.s notes/, /log of your requests to the AI/, /Your account/, /no way to get any of it back/]) {
      expect(within(panel).getByText(text)).toBeInTheDocument()
    }
    const input = screen.getByLabelText(/Type your email address/)
    expect(input).toHaveFocus()
    const confirm = screen.getByRole('button', { name: 'Delete everything' })
    expect(confirm).toBeDisabled()
    await user.type(input, 'someone@else.com')
    expect(confirm).toBeDisabled()
    await user.clear(input)
    await user.type(input, ' Megan@Example.com ')
    expect(confirm).toBeEnabled()
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  it('deletes only after the confirmation, then goes to the sign-in screen', async () => {
    const user = userEvent.setup()
    renderAccount()
    await user.click(screen.getByRole('button', { name: 'Delete account and data' }))
    await user.type(screen.getByLabelText(/Type your email address/), 'megan@example.com')
    await user.click(screen.getByRole('button', { name: 'Delete everything' }))
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Sign in here')).toBeInTheDocument()
  })

  it('cancels without deleting, closes, and puts focus back on the button that opened it', async () => {
    const user = userEvent.setup()
    renderAccount()
    const trigger = screen.getByRole('button', { name: 'Delete account and data' })
    await user.click(trigger)
    await user.type(screen.getByLabelText(/Type your email address/), 'megan@example.com')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Delete everything' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(deleteAccount).not.toHaveBeenCalled()
    // Opening it again starts with nothing typed.
    await user.click(trigger)
    expect(screen.getByLabelText(/Type your email address/)).toHaveValue('')
  })

  it('stays on the page and says what went wrong, as an alert, when it could not be done', async () => {
    deleteAccount.mockImplementation(async () => {
      useAuth.setState({ error: 'Your account could not be deleted. Try again in a moment.' })
      return false
    })
    const user = userEvent.setup()
    renderAccount()
    await user.click(screen.getByRole('button', { name: 'Delete account and data' }))
    await user.type(screen.getByLabelText(/Type your email address/), 'megan@example.com')
    await user.click(screen.getByRole('button', { name: 'Delete everything' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your account could not be deleted. Try again in a moment.')
    expect(screen.queryByText('Sign in here')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete everything' })).toBeEnabled()
  })

  it('ignores a second press while it is working, and cannot be cancelled meanwhile', async () => {
    let finish: (done: boolean) => void = () => {}
    deleteAccount.mockImplementation(() => new Promise<boolean>((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    renderAccount()
    await user.click(screen.getByRole('button', { name: 'Delete account and data' }))
    await user.type(screen.getByLabelText(/Type your email address/), 'megan@example.com')
    await user.click(screen.getByRole('button', { name: 'Delete everything' }))
    // The store marks itself busy while it works; the page follows it.
    act(() => useAuth.setState({ busy: true }))
    await user.click(await screen.findByRole('button', { name: 'Deleting' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(deleteAccount).toHaveBeenCalledTimes(1)
    finish(true)
  })

  it('on this device alone says what it removes, asks for the word DELETE and says when it is done, staying on the page', async () => {
    account('local')
    const user = userEvent.setup()
    renderAccount()
    expect(screen.queryByRole('heading', { name: 'Delete account and data' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete everything on this device' }))
    expect(screen.getByText(/Every project in this browser/)).toBeInTheDocument()
    expect(screen.queryByText(/Your account, so you/)).not.toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: 'Delete everything' })
    await user.type(screen.getByLabelText(/Type DELETE/), 'delete')
    await user.click(confirm)
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Everything saved on this device has been deleted.')).toBeVisible()
    expect(screen.queryByText('Sign in here')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete everything' })).not.toBeInTheDocument()
  })
})
