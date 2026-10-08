import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fingerprint, type NotesDoc } from '../lib/notes.ts'
import { loadNotes, saveNotes } from '../lib/notesStore.ts'
import { saveBoard } from '../lib/boardStore.ts'
import BriefNotes from './BriefNotes.tsx'

const t = '2026-10-07T10:00:00.000Z'
const index = [{ id: 'a', text: 'Care plan for older dogs', where: 'Offers', starred: true, at: t }, { id: 'b', text: 'Pet Pals', at: t }]
const doc = (extra: Record<string, unknown> = {}): NotesDoc => ({ board: { index, indexedAt: t, digest: { text: 'About: pet ideas\nKept in mind: “Care plan for older dogs”', builtAt: t, basedOn: fingerprint(index) }, ...extra } })

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kind: 'digest_workspace', answeredBy: 'base', digest: { about: 'Ideas for pets', decided: [], open: [], standouts: [] } }), { status: 200 })))
})
afterEach(() => vi.unstubAllGlobals())

const renderNotes = (keeping = true) => render(<BriefNotes projectId="p1" projectName="Paws" keeping={keeping} />)
const row = async (name: string) => (await screen.findByText(name)).closest('li') as HTMLElement

describe('Droplet\'s notes in the brief', () => {
  it('shows each workspace with how much is kept, its digest, and everything kept word for word under a fold', async () => {
    await saveNotes('p1', doc())
    renderNotes()
    const board = await row('The board')
    expect(within(board).getByText(/2 kept · saved/)).toBeInTheDocument()
    expect(within(board).getByText(/About: pet ideas/)).toBeInTheDocument()
    expect(within(board).getByText('Everything kept (2)')).toBeInTheDocument()
    expect(board.querySelector('pre')?.textContent).toBe('[Offers] Care plan for older dogs (kept in mind)\nPet Pals')
    // the others have nothing yet, and say when they will
    expect(within(await row('The palette')).getByText(/Nothing yet\. Droplet takes notes when you save the palette\./)).toBeInTheDocument()
    expect(within(await row('The invoices')).getByText(/when you save an invoice/)).toBeInTheDocument()
  })

  it('says when the digest is behind, or was written by the founder', async () => {
    await saveNotes('p1', doc({ outOfDate: true }))
    renderNotes()
    expect(await screen.findByText(/digest is behind/)).toBeInTheDocument()
  })

  it('says Droplet is not keeping notes when the switch is off, and still shows what is kept', async () => {
    await saveNotes('p1', doc())
    renderNotes(false)
    expect(await screen.findByText(/Droplet is not keeping notes\. These are kept until you delete them\./)).toBeInTheDocument()
    expect(await screen.findByText(/About: pet ideas/)).toBeInTheDocument()
  })

  it('lets the founder write the digest, which is then theirs and not written over', async () => {
    await saveNotes('p1', doc())
    const user = userEvent.setup()
    renderNotes()
    await user.click(await screen.findByRole('button', { name: 'Edit the digest of the board' }))
    const area = screen.getByLabelText('Digest of the board')
    await user.clear(area)
    await user.type(area, 'My own account of the board')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await loadNotes('p1')).board?.digest?.text).toBe('My own account of the board'))
    expect((await loadNotes('p1')).board?.digest).toMatchObject({ edited: true, basedOn: fingerprint(index) })
    expect(await screen.findByText(/digest written by you/)).toBeInTheDocument()
  })

  it('will not save an empty digest', async () => {
    await saveNotes('p1', doc())
    const user = userEvent.setup()
    renderNotes()
    await user.click(await screen.findByRole('button', { name: 'Edit the digest of the board' }))
    await user.clear(screen.getByLabelText('Digest of the board'))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('writes the notes again from what is saved now, asking for a new digest whether or not one is due', async () => {
    await saveBoard('p1', { items: [{ id: 'n', kind: 'note', x: 100, y: 100, w: 200, h: 180, text: 'Dog walking', colour: 'yellow', author: 'you' }], layout: [] })
    await saveNotes('p1', doc({ digest: { text: 'My own', builtAt: t, basedOn: fingerprint(index), edited: true } }))
    const user = userEvent.setup()
    renderNotes()
    await user.click(await screen.findByRole('button', { name: 'Rebuild the notes on the board' }))
    await waitFor(async () => expect((await loadNotes('p1')).board?.digest?.text).toMatch(/^About: Ideas for pets/))
    const rebuilt = (await loadNotes('p1')).board!
    expect(rebuilt.index.map((line) => line.text)).toEqual(['Dog walking'])
    expect(rebuilt.digest?.edited).toBeUndefined()
  })

  it('deletes the notes on a workspace only after a second press, and the workspace itself stays', async () => {
    await saveNotes('p1', doc())
    const user = userEvent.setup()
    renderNotes()
    await user.click(await screen.findByRole('button', { name: 'Delete the notes on the board' }))
    expect(screen.getByText(/Delete these notes\? The board stays\./)).toBeInTheDocument()
    expect((await loadNotes('p1')).board).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect((await loadNotes('p1')).board).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Delete the notes on the board' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await loadNotes('p1')).board).toBeUndefined())
  })
})
