import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WORK_MODE_STORAGE_KEY } from '../lib/workMode.ts'
import { useWorkMode } from '../store/workMode.ts'
import IntentBar from './IntentBar.tsx'

// The stylesheets are read as text, since the tests render without them.
// @ts-expect-error node:fs has no types in the app's config
const { readFileSync } = (await import('node:fs')) as { readFileSync: (path: string, encoding: string) => string }

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

describe('attaching files, and the workspaces menu beside the bar', () => {
  const pickFile = async (user: ReturnType<typeof userEvent.setup>, file: File) => user.upload(screen.getByLabelText('Choose files to attach', { selector: 'input' }), file)
  const textFile = () => new File(['# Ideas\n- Kindred Gifting'], 'notes.md', { type: 'text/markdown' })

  it('opens a menu of kinds of file from the plus, and says the whole file is sent', async () => {
    const user = userEvent.setup()
    render(<IntentBar />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Attach a file' }))
    const menu = screen.getByRole('menu', { name: 'Attach a file' })
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Photo or screenshotPNG, JPG, WebP or GIF', 'PDFUp to 4 MB', 'Text filetxt, md, csv or json'])
    expect(menu).toHaveTextContent('The whole file is sent to Droplet’s AI to read, for that message only')
  })

  it('opens the picker for the kind that was chosen, and only that kind', async () => {
    const user = userEvent.setup()
    render(<IntentBar />)
    const picker = screen.getByLabelText('Choose files to attach', { selector: 'input' }) as HTMLInputElement
    const click = vi.spyOn(picker, 'click').mockImplementation(() => undefined)
    await user.click(screen.getByRole('button', { name: 'Attach a file' }))
    await user.click(screen.getByRole('menuitem', { name: /^PDF/ }))
    expect(picker.accept).toBe('.pdf,application/pdf')
    expect(click).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Attach a file' }))
    await user.click(screen.getByRole('menuitem', { name: /^Photo or screenshot/ }))
    expect(picker.accept).toContain('image/png')
    await user.click(screen.getByRole('button', { name: 'Attach a file' }))
    await user.click(screen.getByRole('menuitem', { name: /^Text file/ }))
    expect(picker.accept).toContain('.md')
  })

  it('shows a file as a chip with its name and size, and takes it away on its cross', async () => {
    const user = userEvent.setup()
    render(<IntentBar />)
    await pickFile(user, textFile())
    const chips = await screen.findByRole('group', { name: 'Files for your next message' })
    expect(chips).toHaveTextContent('notes.md')
    expect(chips).toHaveTextContent(/\d+ B/)
    await user.click(screen.getByRole('button', { name: 'Remove notes.md' }))
    expect(screen.queryByRole('group', { name: 'Files for your next message' })).not.toBeInTheDocument()
  })

  it('says why a file could not be read and still takes the others', async () => {
    const user = userEvent.setup()
    render(<IntentBar />)
    await user.upload(screen.getByLabelText('Choose files to attach', { selector: 'input' }), [new File(['x'], 'song.mp3', { type: 'audio/mpeg' }), textFile()])
    expect(await screen.findByRole('alert')).toHaveTextContent(/song\.mp3 is not a kind Droplet can read/)
    expect(screen.getByRole('group', { name: 'Files for your next message' })).toHaveTextContent('notes.md')
  })

  it('refuses a fourth file, and says so', async () => {
    const user = userEvent.setup()
    render(<IntentBar />)
    for (const name of ['a.txt', 'b.txt', 'c.txt', 'd.txt']) await pickFile(user, new File([`words in ${name}`], name, { type: 'text/plain' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/up to 3 files/))
    expect(screen.queryByText('d.txt')).not.toBeInTheDocument()
  })

  it('sends the files with the message, and then forgets them', async () => {
    const user = userEvent.setup()
    const onSubmitIntent = vi.fn()
    render(<IntentBar onSubmitIntent={onSubmitIntent} />)
    await pickFile(user, textFile())
    await screen.findByText('notes.md')
    await write(user, 'What is in this?')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmitIntent).toHaveBeenCalledTimes(1)
    const [said, mode, , attachments] = onSubmitIntent.mock.calls[0]
    expect(said).toBe('What is in this?')
    expect(mode).toBe('base')
    expect(attachments).toEqual([{ kind: 'text', name: 'notes.md', text: '# Ideas\n- Kindred Gifting' }])
    expect(screen.queryByRole('group', { name: 'Files for your next message' })).not.toBeInTheDocument()
    await write(user, 'And without')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmitIntent).toHaveBeenLastCalledWith('And without', 'base')
  })

  it('can send only a file, which asks Droplet to read it', async () => {
    const user = userEvent.setup()
    const onSubmitIntent = vi.fn()
    render(<IntentBar onSubmitIntent={onSubmitIntent} />)
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    await pickFile(user, textFile())
    await screen.findByText('notes.md')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmitIntent.mock.calls[0][0]).toBe('Please read the file I attached.')
  })

  it('opens the workspaces from a button of their own beside the bar, on the right, and one menu at a time', async () => {
    const user = userEvent.setup()
    const onChooseTask = vi.fn()
    render(<IntentBar onChooseTask={onChooseTask} showTip={false} />)
    await user.click(screen.getByRole('button', { name: 'Choose a task' }))
    const menu = screen.getByRole('menu', { name: 'Workspaces' })
    expect(menu).toHaveClass('task-menu--right')
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: 'Attach a file' }))
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Workspaces' })).not.toBeInTheDocument())
    expect(screen.getByRole('menu', { name: 'Attach a file' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Choose a task' }))
    await user.click(await screen.findByRole('menuitem', { name: /Make an invoice/ }))
    expect(onChooseTask).toHaveBeenCalledWith('invoice')
  })

  it('opens the same menu from the tip, from the left', async () => {
    const user = userEvent.setup()
    render(<IntentBar />)
    await user.click(screen.getByRole('button', { name: /Show me a menu of available workspaces/ }))
    expect(screen.getByRole('menu', { name: 'Workspaces' })).not.toHaveClass('task-menu--right')
  })
})

describe('a long message in the bar', () => {
  const field = () => screen.getByLabelText('Describe what you need') as HTMLTextAreaElement

  it('is a field that grows with what is written, up to a limit, and then scrolls', async () => {
    let tall = 80
    const scroll = vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(() => tall)
    try {
      const user = userEvent.setup()
      render(<IntentBar />)
      await user.type(field(), 'a')
      expect(field().style.height).toBe('80px')
      tall = 160
      await user.type(field(), 'b')
      expect(field().style.height).toBe('160px')
      // past the most it grows, it stops and scrolls inside
      tall = 900
      await user.type(field(), 'c')
      expect(field().style.height).toBe('240px')
      // and it shrinks again when the text goes
      tall = 48
      await user.clear(field())
      expect(field().style.height).toBe('48px')
    } finally {
      scroll.mockRestore()
    }
  })

  it('sends on Enter and starts a new line on Shift and Enter, keeping the line breaks', async () => {
    const user = userEvent.setup()
    const onSubmitIntent = vi.fn()
    render(<IntentBar onSubmitIntent={onSubmitIntent} />)
    await user.type(field(), 'First line{Shift>}{Enter}{/Shift}Second line')
    expect(onSubmitIntent).not.toHaveBeenCalled()
    expect(field().value).toBe('First line\nSecond line')
    await user.keyboard('{Enter}')
    expect(onSubmitIntent).toHaveBeenCalledWith('First line\nSecond line', 'base')
    expect(field().value).toBe('')
  })

  it('does not send on Enter while an input method is still composing', () => {
    const onSubmitIntent = vi.fn()
    render(<IntentBar onSubmitIntent={onSubmitIntent} />)
    fireEvent.change(field(), { target: { value: 'konnichiwa' } })
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true })
    expect(onSubmitIntent).not.toHaveBeenCalled()
  })

  it('takes up to 4,000 characters, and shows how many are used only when it is close', async () => {
    const user = userEvent.setup()
    render(<IntentBar />)
    expect(field()).toHaveAttribute('maxlength', '4000')
    expect(screen.queryByText(/\/ 4,000/)).not.toBeInTheDocument()
    await user.click(field())
    await user.paste('x'.repeat(3300))
    expect(screen.getByText('3,300 / 4,000')).toBeInTheDocument()
  })

  it('sends a message far longer than the old limit of 600 characters', async () => {
    const user = userEvent.setup()
    const onSubmitIntent = vi.fn()
    render(<IntentBar onSubmitIntent={onSubmitIntent} />)
    await user.click(field())
    await user.paste('word '.repeat(500).trim())
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmitIntent.mock.calls[0][0].length).toBeGreaterThan(2000)
  })
})

describe('the look of the bar', () => {
  const css = readFileSync('src/components/IntentBar.css', 'utf8')
  const global = readFileSync('src/styles/global.css', 'utf8')

  it('uses the page font in the message field: a textarea does not inherit it unless it is told to', () => {
    expect(/(?:^|\n)button,\ninput,\ntextarea\s*\{[^}]*font:\s*inherit/.test(global)).toBe(true)
  })

  it('keeps the two small buttons on the centre line of the first row, which is 3rem high', () => {
    expect(css).toMatch(/\.intent__plus\s*\{[^}]*height:\s*3rem/)
    expect(css).toMatch(/\.intent__mode\s*\{[^}]*height:\s*2\.5rem/)
    expect(css).toMatch(/\.intent__mode,\n\.intent__send\s*\{\s*margin-bottom:\s*0\.25rem/)
  })
})
