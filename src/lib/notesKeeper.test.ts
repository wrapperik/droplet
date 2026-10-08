import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveBoard } from './boardStore.ts'
import { saveMemory } from './memoryStore.ts'
import { emptyBusiness, emptyClient, newContent } from './invoice.ts'
import { fingerprint } from './notes.ts'
import { keepNotes, updateIndex, writeDigest, WORKSPACE_OF } from './notesKeeper.ts'
import { loadNotes, saveNotes } from './notesStore.ts'
import { emptyMemory, withInvoice, withSetting } from './projectMemory.ts'
import { savePalette } from './projectStore.ts'
import { documentWasSaved, onDocumentSaved } from './storage.ts'

const t1 = '2026-10-07T10:00:00.000Z'
const note = (id: string, text: string, extra: Record<string, unknown> = {}) => ({ id, kind: 'note' as const, x: 100, y: 100, w: 200, h: 180, text, colour: 'yellow' as const, author: 'you' as const, ...extra })
const board = (items: ReturnType<typeof note>[]) => ({ items, layout: [] })
const digestReply = (value: unknown) => new Response(JSON.stringify({ kind: 'digest_workspace', answeredBy: 'base', digest: value }), { status: 200, headers: { 'content-type': 'application/json' } })
const goodDigest = { about: 'Ideas for a pet care business', decided: [], open: ['what to charge'], standouts: [{ ref: 'r1', reason: 'worth a look' }] }

let sent: { workspace: string; items: { ref: string; text: string; starred?: boolean }[] }[] = []
let answer: () => Response = () => digestReply(goodDigest)
beforeEach(() => {
  window.localStorage.clear()
  sent = []
  answer = () => digestReply(goodDigest)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body))
      return answer()
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('which workspace a saved document belongs to', () => {
  it('is the board for the board, the palette for the brand, and the invoices for the memory, and nothing for the rest', () => {
    expect(WORKSPACE_OF).toEqual({ board: 'board', palette: 'brand', memory: 'invoice' })
  })
})

describe('keeping the index up to date', () => {
  it('builds the index of a board from what was saved, at once, with no model asked', async () => {
    await saveBoard('p1', board([note('a', 'Pet Pals'), note('b', 'Care plan', { starred: true })]))
    const notes = await updateIndex('p1', 'board', t1)
    expect(notes?.index.map((entry) => [entry.id, entry.text, entry.starred])).toEqual([['a', 'Pet Pals', undefined], ['b', 'Care plan', true]])
    expect((await loadNotes('p1')).board?.index).toHaveLength(2)
    expect(sent).toHaveLength(0)
  })

  it('builds the palette\'s and the invoices\' from what was saved', async () => {
    await savePalette('p1', { blocks: [{ id: 1, hex: '#1F8FE0', name: 'Droplet blue' }, { id: 2, hex: '#0B4F8A' }], layout: [] })
    expect((await updateIndex('p1', 'brand', t1))?.index.map((entry) => entry.text)).toEqual(['#1F8FE0 Droplet blue', '#0B4F8A'])
    const content = { ...newContent('2026-10-06', 'INV-0001'), business: { ...emptyBusiness(), address: '12 Jacaranda Street' }, client: { ...emptyClient(), name: 'Karoo Candles', address: '5 Long Street' } }
    await saveMemory('p1', withInvoice(emptyMemory(), 'i1', content as never, t1))
    const invoices = await updateIndex('p1', 'invoice', t1)
    expect(invoices?.index[0].text).toMatch(/^INV-0001 for Karoo Candles/)
    expect(JSON.stringify(await loadNotes('p1'))).not.toMatch(/Jacaranda|Long Street/)
  })

  it('keeps the date a thing was added when the board is saved again, and the digest it had', async () => {
    await saveBoard('p1', board([note('a', 'Pet Pals')]))
    await updateIndex('p1', 'board', t1)
    await saveNotes('p1', { board: { ...(await loadNotes('p1')).board!, digest: { text: 'About: pets', builtAt: t1, basedOn: 'old' } } })
    await saveBoard('p1', board([note('a', 'Pet Pals'), note('b', 'Dog walking')]))
    const notes = await updateIndex('p1', 'board', '2026-10-08T10:00:00.000Z')
    expect(notes?.index.map((entry) => [entry.id, entry.at])).toEqual([['a', t1], ['b', '2026-10-08T10:00:00.000Z']])
    expect(notes?.digest?.text).toBe('About: pets')
  })

  it('writes nothing when the index has not changed', async () => {
    await saveBoard('p1', board([note('a', 'Pet Pals')]))
    await updateIndex('p1', 'board', t1)
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    await updateIndex('p1', 'board', '2026-10-09T10:00:00.000Z')
    expect(spy.mock.calls.filter(([key]) => String(key).includes('-notes'))).toHaveLength(0)
    spy.mockRestore()
  })

  it('does nothing when the founder has switched notes off', async () => {
    await saveMemory('p1', withSetting(emptyMemory(), 'notes', false))
    await saveBoard('p1', board([note('a', 'Pet Pals')]))
    expect(await updateIndex('p1', 'board', t1)).toBeNull()
    expect((await loadNotes('p1')).board).toBeUndefined()
  })

  it('does not mix up one project with another', async () => {
    await saveBoard('p1', board([note('a', 'Pet Pals')]))
    await saveBoard('p2', board([note('b', 'Cake pops')]))
    await updateIndex('p1', 'board', t1)
    await updateIndex('p2', 'board', t1)
    expect((await loadNotes('p1')).board?.index[0].text).toBe('Pet Pals')
    expect((await loadNotes('p2')).board?.index[0].text).toBe('Cake pops')
  })
})

describe('writing the digest', () => {
  const setup = async () => {
    await saveBoard('p1', board([note('a', 'Care plan for older dogs', { starred: true }), note('b', 'Pet Pals')]))
    await updateIndex('p1', 'board', t1)
  }

  it('asks for one after a save, copies the idea\'s words from the notes, and keeps it with what it was written from', async () => {
    await setup()
    expect(await writeDigest('p1', 'Paws', 'board')).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ kind: 'digest_workspace', workspace: 'board', projectName: 'Paws' })
    // the starred one first
    expect(sent[0].items[0]).toMatchObject({ ref: 'r1', text: 'Care plan for older dogs', starred: true })
    const kept = (await loadNotes('p1')).board!
    expect(kept.digest?.text).toContain('“Care plan for older dogs” (worth a look, kept in mind)')
    expect(kept.digest?.basedOn).toBe(fingerprint(kept.index))
    expect(kept.outOfDate).toBeUndefined()
  })

  it('does not ask again for an index it has already written one from, nor within five minutes of the last', async () => {
    await setup()
    await writeDigest('p1', 'Paws', 'board')
    expect(await writeDigest('p1', 'Paws', 'board')).toBe(false)
    expect(sent).toHaveLength(1)
    await saveBoard('p1', board([note('a', 'Care plan for older dogs', { starred: true }), note('b', 'Pet Pals'), note('c', 'Dog walking')]))
    await updateIndex('p1', 'board', t1)
    expect(await writeDigest('p1', 'Paws', 'board', { now: () => Date.now() + 60_000 })).toBe(false)
    expect(await writeDigest('p1', 'Paws', 'board', { now: () => Date.now() + 6 * 60_000 })).toBe(true)
    expect(sent).toHaveLength(2)
  })

  it('asks only once when two saves come close together', async () => {
    await setup()
    const [a, b] = await Promise.all([writeDigest('p1', 'Paws', 'board'), writeDigest('p1', 'Paws', 'board')])
    expect([a, b].sort()).toEqual([false, true])
    expect(sent).toHaveLength(1)
  })

  it('marks the notes behind, keeps the old digest, and tries again on the next save, when it fails', async () => {
    await setup()
    await writeDigest('p1', 'Paws', 'board')
    await saveBoard('p1', board([note('a', 'Care plan for older dogs', { starred: true }), note('b', 'Pet Pals'), note('c', 'Dog walking')]))
    await updateIndex('p1', 'board', t1)
    answer = () => new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 })
    expect(await writeDigest('p1', 'Paws', 'board', { now: () => Date.now() + 6 * 60_000 })).toBe(false)
    const behind = (await loadNotes('p1')).board!
    expect(behind.outOfDate).toBe(true)
    expect(behind.digest?.text).toContain('Care plan for older dogs')
    // the very next save, though it is under five minutes later, is tried
    answer = () => digestReply(goodDigest)
    expect(await writeDigest('p1', 'Paws', 'board', { now: () => Date.now() + 6 * 60_000 + 1000 })).toBe(true)
    expect((await loadNotes('p1')).board?.outOfDate).toBeUndefined()
  })

  it('keeps no digest when the one it was given could not be trusted, and says the notes are behind', async () => {
    await setup()
    answer = () => digestReply(null)
    expect(await writeDigest('p1', 'Paws', 'board')).toBe(false)
    expect((await loadNotes('p1')).board?.outOfDate).toBe(true)
    expect((await loadNotes('p1')).board?.digest).toBeNull()
  })

  it('writes one when asked to, even if none is due, and never over one the founder wrote unless asked to', async () => {
    await setup()
    await writeDigest('p1', 'Paws', 'board')
    const kept = (await loadNotes('p1')).board!
    await saveNotes('p1', { board: { ...kept, digest: { text: 'My own digest', builtAt: t1, basedOn: 'x', edited: true } } })
    await saveBoard('p1', board([note('a', 'Care plan for older dogs', { starred: true }), note('z', 'Something new')]))
    await updateIndex('p1', 'board', t1)
    expect(await writeDigest('p1', 'Paws', 'board', { now: () => Date.now() + 99 * 60_000 })).toBe(false)
    expect((await loadNotes('p1')).board?.digest?.text).toBe('My own digest')
    expect(await writeDigest('p1', 'Paws', 'board', { force: true })).toBe(true)
    expect((await loadNotes('p1')).board?.digest?.edited).toBeUndefined()
  })

  it('has nothing to write for a workspace with nothing in it', async () => {
    expect(await writeDigest('p1', 'Paws', 'board')).toBe(false)
    await saveBoard('p1', board([]))
    await updateIndex('p1', 'board', t1)
    expect(await writeDigest('p1', 'Paws', 'board')).toBe(false)
    expect(sent).toHaveLength(0)
  })
})

describe('after a save', () => {
  it('brings the index up to date at once and then writes the digest, for the workspace that was saved', async () => {
    await saveBoard('p1', board([note('a', 'Pet Pals')]))
    await keepNotes('p1', 'Paws', 'board')
    expect((await loadNotes('p1')).board?.digest?.text).toMatch(/^About:/)
    expect(sent.map((request) => request.workspace)).toEqual(['board'])
  })

  it('does nothing for a document that is not a workspace\'s, and for notes switched off', async () => {
    await keepNotes('p1', 'Paws', 'chats')
    await saveMemory('p1', withSetting(emptyMemory(), 'notes', false))
    await saveBoard('p1', board([note('a', 'Pet Pals')]))
    await keepNotes('p1', 'Paws', 'board')
    expect(sent).toHaveLength(0)
    expect(await loadNotes('p1')).toEqual({})
  })

  it('is set going by the stores that hold what a workspace saves, once a save has worked, and not by writing the notes themselves', async () => {
    const told: string[] = []
    const stop = onDocumentSaved((projectId, kind) => told.push(`${projectId}:${kind}`))
    await saveBoard('p1', board([note('a', 'x')]))
    await savePalette('p1', { blocks: [{ id: 1, hex: '#1F8FE0' }, { id: 2, hex: '#0B4F8A' }], layout: [] })
    await saveMemory('p1', emptyMemory())
    await saveNotes('p1', {})
    expect(told).toEqual(['p1:board', 'p1:palette', 'p1:memory'])
    stop()
    await saveBoard('p1', board([]))
    expect(told).toHaveLength(3)
  })

  it('does not tell anyone about a save that failed, and a listener that throws does not stop the others', async () => {
    const told: string[] = []
    const stopBad = onDocumentSaved(() => {
      throw new Error('listener trouble')
    })
    const stop = onDocumentSaved((_projectId, kind) => told.push(kind))
    documentWasSaved('p1', 'board')
    expect(told).toEqual(['board'])
    const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    expect(await saveBoard('p1', board([]))).toBeNull()
    refuse.mockRestore()
    expect(told).toEqual(['board'])
    stop()
    stopBad()
  })
})
