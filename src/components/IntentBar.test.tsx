import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WORK_MODE_STORAGE_KEY } from '../lib/workMode.ts'
import { useWorkMode } from '../store/workMode.ts'
import IntentBar from './IntentBar.tsx'

const openModeMenu = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: /Choose how Droplet works/ }))
const write = async (user: ReturnType<typeof userEvent.setup>, text: string) => user.type(screen.getByLabelText('Describe what you need'), text)

describe('the mode menu in the intent bar', () => {
  beforeEach(() => {
    window.localStorage.removeItem(WORK_MODE_STORAGE_KEY)
    useWorkMode.setState({ mode: 'guide' })
  })

  it('is a button in the bar, always there, that opens Guide and Workspace, with Guide the one in use, and no Advanced switch', async () => {
    const user = userEvent.setup()
    render(<IntentBar />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Choose how Droplet works/ })).toHaveAccessibleName('Choose how Droplet works. Guide mode is on.')
    await openModeMenu(user)
    const modes = screen.getAllByRole('menuitemradio')
    expect(modes.map((row) => row.textContent)).toEqual(['GuideOne step at a time', 'WorkspaceEvery tool at once'])
    expect(modes[0]).toHaveAttribute('aria-checked', 'true')
    expect(modes[1]).toHaveAttribute('aria-checked', 'false')
    // Advanced needs a key with billing, which a free key does not have, so the menu does not offer it
    expect(screen.queryByRole('menuitemcheckbox')).not.toBeInTheDocument()
    expect(screen.getByRole('menu')).not.toHaveTextContent(/Advanced|Searches the web/)
  })

  it('switches to Workspace mode, keeps it on this device, and says so on the button', async () => {
    const user = userEvent.setup()
    render(<IntentBar />)
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
    render(<IntentBar onSubmitIntent={() => undefined} />)
    await openModeMenu(user)
    await user.click(screen.getByRole('menuitemradio', { name: /Workspace/ }))
    await write(user, 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(useWorkMode.getState().mode).toBe('workspace')
  })

  it('shows no pill, and sends Quick', async () => {
    const user = userEvent.setup()
    const onSubmitIntent = vi.fn()
    render(<IntentBar onSubmitIntent={onSubmitIntent} />)
    expect(screen.queryByRole('button', { name: /Advanced is on/ })).not.toBeInTheDocument()
    await write(user, 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmitIntent).toHaveBeenCalledWith('hello', 'base')
  })

  it('opens one menu at a time: the task menu closes the mode menu', async () => {
    const user = userEvent.setup()
    render(<IntentBar />)
    await openModeMenu(user)
    expect(screen.getByRole('menu', { name: 'How Droplet works' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Choose a task' }))
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'How Droplet works' })).not.toBeInTheDocument())
    expect(screen.getByRole('menu', { name: 'Workspaces' })).toBeInTheDocument()
  })

  it('closes the mode menu on Escape', async () => {
    const user = userEvent.setup()
    render(<IntentBar />)
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

describe('the bar reading the room', () => {
  const nudge = { id: 'contrast', label: 'Fix the contrast?', text: 'Fix the contrast between my text and background colours', kind: 'nudge' as const }
  const way = { id: 'names', label: 'Brainstorm names', text: 'Brainstorm some name ideas for my business', kind: 'hint' as const }

  it('says what suits the moment in the empty field, and the usual words without hints', () => {
    const { rerender } = render(<IntentBar />)
    expect(screen.getByLabelText('Describe what you need')).toHaveAttribute('placeholder', 'Write your message...')
    rerender(<IntentBar hints={{ placeholder: 'Ask about the 2 selected notes' }} />)
    expect(screen.getByLabelText('Describe what you need')).toHaveAttribute('placeholder', 'Ask about the 2 selected notes')
  })

  it('shows what is selected, with a cross that clears it', async () => {
    const onClear = vi.fn()
    render(<IntentBar hints={{ selection: { label: '2 notes selected', onClear } }} />)
    expect(screen.getByRole('group', { name: 'Suggestions' })).toHaveTextContent('2 notes selected')
    await userEvent.click(screen.getByRole('button', { name: 'Clear the selection' }))
    expect(onClear).toHaveBeenCalled()
  })

  it('shows chips that send their request when pressed, and nudges that can be put away', async () => {
    const onChip = vi.fn()
    const onDismiss = vi.fn()
    render(<IntentBar hints={{ chips: [nudge, way], onChip, onDismiss }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Brainstorm names' }))
    expect(onChip).toHaveBeenCalledWith(way)
    expect(screen.queryByRole('button', { name: 'Put away: Brainstorm names' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Put away: Fix the contrast?' }))
    expect(onDismiss).toHaveBeenCalledWith(nudge)
    expect(onChip).toHaveBeenCalledTimes(1)
  })

  it('waits while Droplet works', () => {
    render(<IntentBar busy hints={{ chips: [way], onChip: vi.fn() }} />)
    expect(screen.getByRole('button', { name: 'Brainstorm names' })).toBeDisabled()
  })

  it('draws nothing above the bar when there is nothing to say', () => {
    render(<IntentBar hints={{ chips: [], selection: null }} />)
    expect(screen.queryByRole('group', { name: 'Suggestions' })).not.toBeInTheDocument()
  })
})
