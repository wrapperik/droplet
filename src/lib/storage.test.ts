import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearBoard, loadBoard, openBoardForProject, saveBoard } from './boardStore.ts'
import { clearChats, loadChats, saveChats } from './chatStore.ts'
import { openBoard, docOf } from './boardState.ts'
import { loadInvoice, saveArrangement } from './invoiceStore.ts'
import { loadMemory, saveMemory } from './memoryStore.ts'
import { emptyMemory, withIdea } from './projectMemory.ts'
import { loadPalette, savePalette } from './projectStore.ts'
import { slowMemoryStorage } from '../test/slowStorage.ts'
import { localDocumentStorage, documentStorage, useDocumentStorage, type DocumentStorage } from './storage.ts'

beforeEach(() => window.localStorage.clear())

describe('the local document storage', () => {
  it('stores a document under the key the app has always used, and reads it back', async () => {
    expect(await localDocumentStorage.write('duckstack', 'board', { a: 1 })).toBe(true)
    expect(window.localStorage.getItem('droplet-project-duckstack-board')).toBe('{"a":1}')
    expect(await localDocumentStorage.read('duckstack', 'board')).toEqual({ a: 1 })
  })

  it('reads null for a document that is not there, or that is not JSON, and never throws', async () => {
    expect(await localDocumentStorage.read('duckstack', 'palette')).toBeNull()
    window.localStorage.setItem('droplet-project-duckstack-palette', '{not json')
    expect(await localDocumentStorage.read('duckstack', 'palette')).toBeNull()
  })

  it('keeps one project\'s documents apart from another\'s, and one kind from another', async () => {
    await localDocumentStorage.write('a', 'memory', 1)
    await localDocumentStorage.write('b', 'memory', 2)
    await localDocumentStorage.write('a', 'chats', 3)
    expect(await localDocumentStorage.read('a', 'memory')).toBe(1)
    expect(await localDocumentStorage.read('b', 'memory')).toBe(2)
    expect(await localDocumentStorage.read('a', 'chats')).toBe(3)
  })

  it('removes a document, and says false, rather than throwing, when the browser refuses to store one', async () => {
    await localDocumentStorage.write('duckstack', 'invoice', { a: 1 })
    await localDocumentStorage.remove('duckstack', 'invoice')
    expect(await localDocumentStorage.read('duckstack', 'invoice')).toBeNull()
    const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(await localDocumentStorage.write('duckstack', 'invoice', { a: 1 })).toBe(false)
    refuse.mockRestore()
  })
})

describe('swapping the storage', () => {
  let before: DocumentStorage
  afterEach(() => useDocumentStorage(before))

  it('is how a database goes in: every store reads and writes through it, and nothing touches this browser\'s storage', async () => {
    const { driver, documents } = slowMemoryStorage(1)
    before = useDocumentStorage(driver)
    expect(documentStorage()).toBe(driver)

    const palette = await savePalette('p', { blocks: [{ id: 1, hex: '#1F8FE0' }, { id: 2, hex: '#0B4F8A' }], layout: [] })
    const board = await saveBoard('p', { ...docOf(openBoard([])), layout: [] })
    const arrangement = await saveArrangement('p', { layout: [] })
    expect(await saveMemory('p', withIdea(emptyMemory(), 'name', 'Kindred', '2026-10-05T09:00:00'))).toBe(true)
    expect(await saveChats('p', [{ id: 'c', title: 'Hello', updatedAt: '2026-10-05T10:00:00', messages: [{ id: 1, from: 'you', text: 'Hello' }] }])).toBe(true)
    expect(palette).not.toBeNull()
    expect(board).not.toBeNull()
    expect(arrangement).not.toBeNull()

    expect([...documents.keys()].sort()).toEqual(['p/board', 'p/chats', 'p/invoice', 'p/memory', 'p/palette'])
    expect(window.localStorage.length).toBe(0)

    expect((await loadPalette('p'))?.blocks).toHaveLength(2)
    expect(await loadBoard('p')).not.toBeNull()
    expect(await loadInvoice('p')).not.toBeNull()
    expect((await loadMemory('p')).idea?.name).toBe('Kindred')
    expect((await loadChats('p'))[0].title).toBe('Hello')
    expect(docOf(await openBoardForProject('p')).items).toEqual([])
  })

  it('still validates what comes back, whatever the storage holds', async () => {
    const { driver, documents } = slowMemoryStorage(1)
    before = useDocumentStorage(driver)
    documents.set('p/palette', { blocks: 'nonsense' })
    documents.set('p/memory', 42)
    documents.set('p/chats', [{ id: 'good', title: 'Fine', updatedAt: 'x', messages: [] }, { nope: true }])
    expect(await loadPalette('p')).toBeNull()
    expect(await loadMemory('p')).toEqual(emptyMemory())
    expect((await loadChats('p')).map((chat) => chat.id)).toEqual(['good'])
  })

  it('clears a document through it', async () => {
    const { driver, documents, calls } = slowMemoryStorage(1)
    before = useDocumentStorage(driver)
    await saveChats('p', [])
    await clearChats('p')
    await saveBoard('p', { ...docOf(openBoard([])), layout: [] })
    await clearBoard('p')
    expect(documents.size).toBe(0)
    expect(calls).toContain('remove p/chats')
    expect(calls).toContain('remove p/board')
  })

  it('hands back the driver it replaced, so it can be put back', () => {
    const { driver } = slowMemoryStorage()
    before = useDocumentStorage(driver)
    expect(before).toBe(localDocumentStorage)
  })
})
