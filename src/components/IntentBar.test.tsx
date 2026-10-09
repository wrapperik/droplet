import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Allowance } from '../compose/spec.ts'
import { WORK_MODE_STORAGE_KEY } from '../lib/workMode.ts'
import { useWorkMode } from '../store/workMode.ts'
import IntentBar from './IntentBar.tsx'

const left = (advancedLeft: number, resetsAt: string | null = null): Allowance => ({ advancedLeft, advancedLimit: 10, resetsAt })
const openModeMenu = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: /Choose how Droplet works/ }))
const write = async (user: ReturnType<typeof userEvent.setup>, text: string) => user.type(screen.getByLabelText('Describe what you need'), text)
const advancedRow = () => screen.getByRole('menuitemcheckbox', { name: /Advanced/ })

describe('the mode menu in the intent bar', () => {
  beforeEach(() => {
    window.localStorage.removeItem(WORK_MODE_STORAGE_KEY)
    useWorkMode.setState({ mode: 'guide' })
  })

  it('is a button in the bar, always there, that opens Guide and Workspace, with Guide the one in use, and Advanced below them', async () => {
    const user = userEvent.setup()
    render(<IntentBar allowance={left(7)} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Choose how Droplet works/ })).toHaveAccessibleName('Choose how Droplet works. Guide mode is on.')
    await openModeMenu(user)
    const modes = screen.getAllByRole('menuitemradio')
    expect(modes.map((row) => row.textContent)).toEqual(['GuideOne step at a time', 'WorkspaceEvery tool at once'])
    expect(modes[0]).toHaveAttribute('aria-checked', 'true')
    expect(modes[1]).toHaveAttribute('aria-checked', 'false')
    expect(advancedRow()).toHaveTextContent('AdvancedSearches the web · 7 of 10 left today')
    expect(advancedRow()).toHaveAttribute('aria-checked', 'false')
  })

  it('switches to Workspace mode, keeps it on this device, and says so on the button', async () => {
    const user = userEvent.setup()
    render(<IntentBar allowance={left(7)} />)
    await openModeMenu(user)
    await user.click(screen.getByRole('menuitemradio', { name: /Workspace/ }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(useWorkMode.getState().mode).toBe('workspace')
    expect(window.localStorage.getItem(WORK_MODE_STORAGE_KEY)).toBe('workspace')
    expect(screen.getByRole('button', { name: /Choose how Droplet works/ })).toHaveAccessibleName('Choose how Droplet works. Workspace mode is on.')
    await openModeMenu(user)
    expect(screen.getByRole('menuitemradio', { name: /Workspace/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('keeps the mode after a message is sent: it is not for one message only', async () => {
    const user = userEvent.setup()
    render(<IntentBar allowance={left(7)} onSubmitIntent={() => undefined} />)
    await openModeMenu(user)
    await user.click(screen.getByRole('menuitemradio', { name: /Workspace/ }))
    await write(user, 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(useWorkMode.getState().mode).toBe('workspace')
  })

  it('shows no pill, and sends Quick, unless Advanced is switched on', async () => {
    const user = userEvent.setup()
    const onSubmitIntent = vi.fn()
    render(<IntentBar allowance={left(7)} onSubmitIntent={onSubmitIntent} />)
    expect(screen.queryByRole('button', { name: /Advanced is on/ })).not.toBeInTheDocument()
    await write(user, 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmitIntent).toHaveBeenCalledWith('hello', 'base')
  })

  it('shows an Advanced pill in the bar when it is switched on, and the pill turns it off', async () => {
    const user = userEvent.setup()
    const onSubmitIntent = vi.fn()
    render(<IntentBar allowance={left(7)} onSubmitIntent={onSubmitIntent} />)
    await openModeMenu(user)
    await user.click(advancedRow())
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    const pill = screen.getByRole('button', { name: /Advanced is on for your next message/ })
    expect(pill).toHaveTextContent('Advanced')
    await user.click(pill)
    expect(screen.queryByRole('button', { name: /Advanced is on/ })).not.toBeInTheDocument()
    await write(user, 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmitIntent).toHaveBeenCalledWith('hello', 'base')
  })

  it('switches Advanced off from the menu as well', async () => {
    const user = userEvent.setup()
    render(<IntentBar allowance={left(7)} />)
    await openModeMenu(user)
    await user.click(advancedRow())
    await openModeMenu(user)
    expect(advancedRow()).toHaveAttribute('aria-checked', 'true')
    await user.click(advancedRow())
    expect(screen.queryByRole('button', { name: /Advanced is on/ })).not.toBeInTheDocument()
  })

  it('sends the next message as Advanced, and then goes back to Quick: the pill clears after sending', async () => {
    const user = userEvent.setup()
    const onSubmitIntent = vi.fn()
    render(<IntentBar allowance={left(7)} onSubmitIntent={onSubmitIntent} />)
    await openModeMenu(user)
    await user.click(advancedRow())
    await write(user, 'What does CIPC charge?')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmitIntent).toHaveBeenLastCalledWith('What does CIPC charge?', 'advanced')
    expect(screen.queryByRole('button', { name: /Advanced is on/ })).not.toBeInTheDocument()
    await write(user, 'and SARS?')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmitIntent).toHaveBeenLastCalledWith('and SARS?', 'base')
    await openModeMenu(user)
    expect(advancedRow()).toHaveAttribute('aria-checked', 'false')
  })

  it('disables the Advanced row when none are left, says when one comes back, and does not hide it', async () => {
    const user = userEvent.setup()
    const back = new Date(2099, 0, 1, 14, 20)
    render(<IntentBar allowance={left(0, back.toISOString())} onSubmitIntent={() => undefined} />)
    await openModeMenu(user)
    const row = advancedRow()
    expect(row).toHaveAttribute('aria-disabled', 'true')
    expect(row).toHaveTextContent(/None left today · back tomorrow at 14:20|None left today · back at 14:20/)
    await user.click(row)
    // pressing it does nothing: the menu stays open and no pill appears
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Advanced is on/ })).not.toBeInTheDocument()
  })

  it('shows Advanced with no count when the server has not said, and lets it be switched on', async () => {
    const user = userEvent.setup()
    render(<IntentBar allowance={null} />)
    await openModeMenu(user)
    const row = advancedRow()
    expect(row).toHaveTextContent('Searches the web')
    expect(row).not.toHaveTextContent(/left today/)
    expect(row).not.toHaveAttribute('aria-disabled')
    await user.click(row)
    expect(await screen.findByRole('button', { name: /Advanced is on/ })).toBeInTheDocument()
  })

  it('turns Advanced off if the allowance runs out while it is on, so the pill never promises what is not there', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<IntentBar allowance={left(1)} />)
    await openModeMenu(user)
    await user.click(advancedRow())
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
    expect(screen.getByRole('menu', { name: 'How Droplet works' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Choose a task' }))
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'How Droplet works' })).not.toBeInTheDocument())
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

describe('where a sent message comes from', () => {
  it('passes the bar\'s place when the bar has a size, so the message can come out of its top, and nothing when it has none', async () => {
    const user = userEvent.setup()
    const onSubmitIntent = vi.fn()
    render(<IntentBar onSubmitIntent={onSubmitIntent} />)
    await write(user, 'first')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmitIntent).toHaveBeenLastCalledWith('first', 'base')

    const form = document.querySelector('.intent__bar')!
    vi.spyOn(form, 'getBoundingClientRect').mockReturnValue({ left: 300, top: 600, width: 800, height: 64, right: 1100, bottom: 664, x: 300, y: 600, toJSON: () => ({}) } as DOMRect)
    await write(user, 'second')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmitIntent).toHaveBeenLastCalledWith('second', 'base', { left: 300, top: 600, width: 800, height: 64 })
  })
})
