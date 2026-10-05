import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AccountMenu from './AccountMenu.tsx'

describe('the account menu', () => {
  it('opens the account page and signs out, each closing the menu', async () => {
    const user = userEvent.setup()
    const onAccount = vi.fn()
    const onSignOut = vi.fn()
    render(<AccountMenu name="Megan" onAccount={onAccount} onSignOut={onSignOut} />)
    await user.click(screen.getByRole('button', { name: /Megan/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Account' }))
    expect(onAccount).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Megan/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})
