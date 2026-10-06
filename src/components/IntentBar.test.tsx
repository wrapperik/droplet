import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Allowance } from '../compose/spec.ts'
import IntentBar from './IntentBar.tsx'

const left = (advancedLeft: number, resetsAt: string | null = null): Allowance => ({ advancedLeft, advancedLimit: 10, resetsAt })
const openModeMenu = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Choose how I answer' }))
const write = async (user: ReturnType<typeof userEvent.setup>, text: string) => user.type(screen.getByLabelText('Describe what you need'), text)

describe('the mode menu in the intent bar', () => {
  it('is a button in the bar, always there, that opens Quick and Advanced, with Quick the one in use', async () => {
    const user = userEvent.setup()
    render(<IntentBar allowance={left(7)} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await openModeMenu(user)
    const rows = screen.getAllByRole('menuitemradio')
    expect(rows.map((row) => row.textContent)).toEqual(['QuickFast, from what it knows', 'AdvancedSearches the web · 7 of 10 left today'])
    expect(rows[0]).toHaveAttribute('aria-checked', 'true')
    expect(rows[1]).toHaveAttribute('aria-checked', 'false')
  })

  it('shows no pill, and sends Quick, unless Advanced is chosen', async () => {
    const user = userEvent.setup()
    const onSubmitIntent = vi.fn()
    render(<IntentBar allowance={left(7)} onSubmitIntent={onSubmitIntent} />)
    expect(screen.queryByRole('button', { name: /Advanced is on/ })).not.toBeInTheDocument()
    await write(user, 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmitIntent).toHaveBeenCalledWith('hello', 'base')
  })

  it('shows an Advanced pill in the bar when it is chosen, and the pill turns it off', async () => {
    const user = userEvent.setup()
    const onSubmitIntent = vi.fn()
    render(<IntentBar allowance={left(7)} onSubmitIntent={onSubmitIntent} />)
    await openModeMenu(user)
    await user.click(screen.getByRole('menuitemradio', { name: /Advanced/ }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    const pill = screen.getByRole('button', { name: /Advanced is on for your next message/ })
    expect(pill).toHaveTextContent('Advanced')
    await user.click(pill)
    expect(screen.queryByRole('button', { name: /Advanced is on/ })).not.toBeInTheDocument()
    await write(user, 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmitIntent).toHaveBeenCalledWith('hello', 'base')
  })

  it('sends the next message as Advanced, and then goes back to Quick: the pill clears after sending', async () => {
    const user = userEvent.setup()
    const onSubmitIntent = vi.fn()
    render(<IntentBar allowance={left(7)} onSubmitIntent={onSubmitIntent} />)
    await openModeMenu(user)
    await user.click(screen.getByRole('menuitemradio', { name: /Advanced/ }))
    await write(user, 'What does CIPC charge?')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmitIntent).toHaveBeenLastCalledWith('What does CIPC charge?', 'advanced')
    expect(screen.queryByRole('button', { name: /Advanced is on/ })).not.toBeInTheDocument()
    await write(user, 'and SARS?')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmitIntent).toHaveBeenLastCalledWith('and SARS?', 'base')
  })

  it('shows Quick as the one in use again after Advanced has been sent', async () => {
    const user = userEvent.setup()
    render(<IntentBar allowance={left(7)} onSubmitIntent={() => undefined} />)
    await openModeMenu(user)
    await user.click(screen.getByRole('menuitemradio', { name: /Advanced/ }))
    await write(user, 'hi')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await openModeMenu(user)
    expect(screen.getByRole('menuitemradio', { name: /Quick/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: /Advanced/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('disables the Advanced row when none are left, says when one comes back, and does not hide it', async () => {
    const user = userEvent.setup()
    const back = new Date(2099, 0, 1, 14, 20)
    render(<IntentBar allowance={left(0, back.toISOString())} onSubmitIntent={() => undefined} />)
    await openModeMenu(user)
    const row = screen.getByRole('menuitemradio', { name: /Advanced/ })
    expect(row).toHaveAttribute('aria-disabled', 'true')
    expect(row).toHaveTextContent(/None left today · back tomorrow at 14:20|None left today · back at 14:20/)
    await user.click(row)
    // pressing it does nothing: the menu stays open and no pill appears
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Advanced is on/ })).not.toBeInTheDocument()
    // Quick is still there to choose
    await user.click(screen.getByRole('menuitemradio', { name: /Quick/ }))
  })

  it('shows Advanced with no count when the server has not said, and lets it be chosen', async () => {
    const user = userEvent.setup()
    render(<IntentBar allowance={null} />)
    await openModeMenu(user)
    const row = screen.getByRole('menuitemradio', { name: /Advanced/ })
    expect(row).toHaveTextContent('Searches the web')
    expect(row).not.toHaveTextContent(/left today/)
    expect(row).not.toHaveAttribute('aria-disabled')
    await user.click(row)
    expect(await screen.findByRole('button', { name: /Advanced is on/ })).toBeInTheDocument()
  })

  it('turns Advanced off if the allowance runs out while it is chosen, so the pill never promises what is not there', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<IntentBar allowance={left(1)} />)
    await openModeMenu(user)
    await user.click(screen.getByRole('menuitemradio', { name: /Advanced/ }))
    expect(screen.getByRole('button', { name: /Advanced is on/ })).toBeInTheDocument()
    rerender(<IntentBar allowance={left(0)} />)
    expect(screen.queryByRole('button', { name: /Advanced is on/ })).not.toBeInTheDocument()
  })

  it('does not switch Advanced on by itself: it is Quick on every new bar, whatever the allowance', () => {
    render(<IntentBar allowance={left(10)} />)
    expect(screen.queryByRole('button', { name: /Advanced is on/ })).not.toBeInTheDocument()
  })

  it('opens one menu at a time: the task menu closes the mode menu', async () => {
    const user = userEvent.setup()
    render(<IntentBar allowance={left(7)} />)
    await openModeMenu(user)
    expect(screen.getByRole('menu', { name: /How Droplet answers/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Choose a task' }))
    await waitFor(() => expect(screen.queryByRole('menu', { name: /How Droplet answers/ })).not.toBeInTheDocument())
    expect(screen.getByRole('menu', { name: 'Workspaces' })).toBeInTheDocument()
  })

  it('closes the mode menu on Escape', async () => {
    const user = userEvent.setup()
    render(<IntentBar allowance={left(7)} />)
    await openModeMenu(user)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })
})
