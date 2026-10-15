import { useCallback, useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { openBoard, reduceBoard, type BoardAction } from '../../lib/boardState.ts'
import type { NoteItem } from '../../lib/boardTypes.ts'
import { loadMemory } from '../../lib/memoryStore.ts'
import { setDocumentStorage, type DocumentStorage } from '../../lib/storage.ts'
import { slowMemoryStorage } from '../../test/slowStorage.ts'
import BoardWorkspace from './BoardWorkspace.tsx'

const note = (id: string, text: string): NoteItem => ({ id, kind: 'note', x: 400, y: 400, w: 200, h: 180, text, colour: 'yellow', author: 'you' })

function Harness({ topInset }: { topInset?: number }) {
  const [state, setState] = useState(() => openBoard([note('a', 'Kindred Gifting')]))
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
