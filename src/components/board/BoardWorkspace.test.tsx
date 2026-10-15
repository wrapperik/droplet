import { useCallback, useEffect, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { docOf, openBoard, reduceBoard, type BoardAction, type BoardState } from '../../lib/boardState.ts'
import type { NoteItem } from '../../lib/boardTypes.ts'
import { loadMemory } from '../../lib/memoryStore.ts'
import { setDocumentStorage, type DocumentStorage } from '../../lib/storage.ts'
import { slowMemoryStorage } from '../../test/slowStorage.ts'
import BoardWorkspace from './BoardWorkspace.tsx'

const note = (id: string, text: string): NoteItem => ({ id, kind: 'note', x: 400, y: 400, w: 200, h: 180, text, colour: 'yellow', author: 'you' })

let latest: BoardState
function Harness({ topInset, items = [note('a', 'Kindred Gifting')] }: { topInset?: number; items?: NoteItem[] }) {
  const [state, setState] = useState(() => openBoard(items))
  useEffect(() => {
    latest = state
  })
  const dispatch = useCallback((action: BoardAction) => setState((current) => reduceBoard(current, action)), [])
  return (
    <MemoryRouter>
      <BoardWorkspace projectId="p1" projectName="Kindred" state={state} dispatch={dispatch} topInset={topInset} />
    </MemoryRouter>
  )
}

beforeEach(() => localStorage.clear())

describe('the board workspace', () => {
  it('remembers a name only after the confirm, and puts it in the project memory', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(document.querySelector<HTMLElement>('[data-item-id="a"]')!)
    await user.click(screen.getByRole('button', { name: 'Use as business name' }))
    expect((await loadMemory('p1')).idea).toBeUndefined()
    await user.click(screen.getByRole('button', { name: 'Remember' }))
    expect((await loadMemory('p1')).idea?.name).toBe('Kindred Gifting')
    expect((await loadMemory('p1')).business?.details.name).toBe('Kindred Gifting')
  })

  it('has no Windows menu, since the board is the whole screen and there is no window to take away', () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: /Windows/ })).not.toBeInTheDocument()
  })

  it('forgets a remembered name from the same note, after the question', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(document.querySelector<HTMLElement>('[data-item-id="a"]')!)
    await user.click(screen.getByRole('button', { name: 'Use as business name' }))
    await user.click(screen.getByRole('button', { name: 'Remember' }))
    expect((await loadMemory('p1')).idea?.name).toBe('Kindred Gifting')
    await user.click(screen.getByRole('button', { name: 'Use as business name' }))
    expect(screen.getByRole('group', { name: 'Remember this as the business name?' })).toHaveTextContent('already remembered as the business name')
    expect(screen.queryByRole('button', { name: 'Remember' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Forget it' }))
    expect((await loadMemory('p1')).idea).toBeUndefined()
    // what is on invoices is the founder's to change there, so the business name stays
    expect((await loadMemory('p1')).business?.details.name).toBe('Kindred Gifting')
  })

  it('remembers nothing when the founder cancels', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(document.querySelector<HTMLElement>('[data-item-id="a"]')!)
    await user.click(screen.getByRole('button', { name: 'Use as offer' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect((await loadMemory('p1')).idea).toBeUndefined()
  })

  it('has the seven tools on the task bar with their names written out, in a fixed order, and nothing to add, remove, move or reset', () => {
    render(<Harness />)
    const bar = screen.getByRole('toolbar', { name: 'Board tools' })
    expect(within(bar).getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual(['Select', 'Sticky note', 'Shape', 'Text', 'Frame', 'Arrow', 'Templates'])
    for (const label of ['Select', 'Note', 'Shape', 'Text', 'Frame', 'Arrow', 'Templates']) expect(within(bar).getByRole('button', { name: label })).toHaveTextContent(label)
    expect(within(bar).getAllByRole('tooltip')).toHaveLength(7)
    for (const name of [/Reset layout/, /Add or remove/, /Windows/, /drag/i]) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  })

  it('has an Export button in the header', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Export the board' })).toBeInTheDocument()
  })

  it('has no window round the board: it is a region of its own that fills the screen, with its reason as a label', () => {
    render(<Harness />)
    const board = screen.getByRole('region', { name: 'Board' })
    expect(board).toHaveClass('board-stage')
    expect(board.closest('.workspace__card')).toBeNull()
    expect(within(board).getByRole('button', { name: 'Why is this here?' })).toBeInTheDocument()
  })

  it('starts the board below the header and the toolbar that are over it, by the height it is given', () => {
    const { unmount } = render(<Harness />)
    expect(document.querySelector<HTMLElement>('.board__surface')!.style.top).toBe('56px')
    expect(document.querySelector<HTMLElement>('.board__sizer')!.style.height).toBe(`${3200 * 0.5 + 56 + 56}px`)
    unmount()
    render(<Harness topInset={200} />)
    expect(document.querySelector<HTMLElement>('.board__surface')!.style.top).toBe('256px')
    expect(document.querySelector<HTMLElement>('.board__sizer')!.style.height).toBe(`${3200 * 0.5 + 256 + 56}px`)
  })
})

describe('the options strip under the bar', () => {
  const barItems = () => within(screen.getByRole('toolbar', { name: 'Board tools' })).getAllByRole('button').map((button) => button.textContent)

  it('shows nothing while only Select is in hand', () => {
    render(<Harness />)
    expect(document.querySelector('.boardstrip')).toBeNull()
    expect(screen.queryByRole('group', { name: /options$/ })).not.toBeInTheDocument()
  })

  it('shows the options of the tool in hand only, with a label saying which tool they are for, and takes them away with the tool', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Note' }))
    const strip = screen.getByRole('group', { name: 'Sticky note options' })
    expect(within(strip).getByRole('radiogroup', { name: 'Colour of the next note' })).toBeInTheDocument()
    expect(within(strip).getByRole('button', { name: 'Add a note to the middle of the view' })).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: /options$/ })).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Arrow' }))
    expect(screen.getByRole('group', { name: 'Arrow options' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Sticky note options' })).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Arrow' }))
    await waitFor(() => expect(document.querySelector('.boardstrip')).toBeNull())
  })

  it('leaves the bar exactly as it is: the same seven labelled buttons whichever tool is in hand, and the options are not among them', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const before = barItems()
    expect(before).toEqual(['Select', 'Note', 'Shape', 'Text', 'Frame', 'Arrow', 'Templates'])
    for (const tool of ['Note', 'Shape', 'Text', 'Frame', 'Arrow']) {
      await user.click(screen.getByRole('button', { name: tool }))
      // the buttons of the bar's own items (the options are in the strip, which is a group of its own and not a button of the bar)
      expect(within(screen.getByRole('toolbar', { name: 'Board tools' })).getAllByRole('button').filter((button) => button.classList.contains('taskbar__trigger')).map((button) => button.textContent)).toEqual(before)
      const strip = document.querySelector('.boardstrip')!
      expect(strip).not.toBeNull()
      expect(strip.closest('.taskbar__trigger')).toBeNull()
      expect(strip.parentElement?.closest('.taskbar__button')).toBeNull()
    }
  })

  it('is reached by Tab from the tool in hand, before the tools that follow it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Shape' }))
    await user.tab()
    expect(screen.getByRole('radio', { name: 'Rectangle' })).toHaveFocus()
  })

  it('keeps what each option does: a colour is chosen for the next note, and the plus puts one on the board', async () => {
    const user = userEvent.setup()
    render(<Harness items={[]} />)
    await user.click(screen.getByRole('button', { name: 'Note' }))
    await user.click(screen.getByRole('radio', { name: 'Lilac' }))
    expect(latest.noteColour).toBe('lilac')
    await user.click(screen.getByRole('button', { name: 'Add a note to the middle of the view' }))
    expect(docOf(latest).items).toHaveLength(1)
    expect(docOf(latest).items[0]).toMatchObject({ kind: 'note', colour: 'lilac' })
  })
})

describe('an empty board', () => {
  const panel = () => screen.queryByRole('region', { name: 'Start your board' })

  it('says what the board is for and offers template cards and the sticky note, in the middle of the view', () => {
    render(<Harness items={[]} />)
    const start = panel()!
    expect(start).toBeInTheDocument()
    expect(within(start).getAllByRole('button').map((button) => button.querySelector('.templates__name')?.textContent)).toEqual(['Brain dump', 'Customer and problem', 'Offer comparison', 'Name ideas'])
    expect(start).toHaveTextContent('Or choose Note in the bar')
    expect(start.closest('.board__empty')).not.toBeNull()
    // the layer it sits in is inside the board's own region, below what covers the top
    expect(screen.getByRole('region', { name: 'Board' })).toContainElement(start)
  })

  it('is not there when there is something on the board', () => {
    render(<Harness />)
    expect(panel()).not.toBeInTheDocument()
  })

  it('puts the template on the board as one undo step when a card is chosen, and goes; undoing brings it back', async () => {
    const user = userEvent.setup()
    render(<Harness items={[]} />)
    await user.click(within(panel()!).getByRole('button', { name: /^Name ideas/ }))
    expect(docOf(latest).items.length).toBeGreaterThan(0)
    expect(docOf(latest).items.some((item) => item.group?.startsWith('name_ideas:'))).toBe(true)
    expect(panel()).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(docOf(latest).items).toHaveLength(0)
    expect(panel()).toBeInTheDocument()
  })

  it('comes back when the board is emptied', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(panel()).not.toBeInTheDocument()
    await user.click(document.querySelector<HTMLElement>('[data-item-id="a"]')!)
    await user.keyboard('{Delete}')
    expect(docOf(latest).items).toHaveLength(0)
    expect(panel()).toBeInTheDocument()
  })

  it('can be reached with the keyboard', async () => {
    const user = userEvent.setup()
    render(<Harness items={[]} />)
    const cards = within(panel()!).getAllByRole('button')
    for (let i = 0; i < 40 && document.activeElement !== cards[0]; i++) await user.tab()
    expect(cards[0]).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(docOf(latest).items.length).toBeGreaterThan(0)
  })

  it('does not take presses outside itself: a double-click on the empty board still adds a note', async () => {
    const user = userEvent.setup()
    render(<Harness items={[]} />)
    await user.dblClick(document.querySelector<HTMLElement>('.board__surface')!)
    expect(docOf(latest).items).toHaveLength(1)
    expect(panel()).not.toBeInTheDocument()
  })
})

describe('the board workspace while what was saved is still being read', () => {
  let before: DocumentStorage
  afterEach(() => setDocumentStorage(before))

  it('says nothing about saving, and keeps Save waiting, until it has been read, then says where things stand', async () => {
    before = setDocumentStorage(slowMemoryStorage(30).driver)
    render(<Harness />)
    expect(screen.queryByText(/Not saved yet|Unsaved changes|All changes saved/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled()
    expect(await screen.findByText('Not saved yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save/ })).toBeEnabled()
  })

  it('is not told a board was saved that was, once it has read it', async () => {
    const slow = slowMemoryStorage(10)
    before = setDocumentStorage(slow.driver)
    render(<Harness />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Save/ }))
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
    expect(slow.documents.has('p1/board')).toBe(true)
  })
})
