import { describe, expect, it } from 'vitest'
import { newContent, emptyBusiness, emptyClient } from './invoice.ts'
import type { BoardItem } from './boardTypes.ts'
import { formatRand } from './money.ts'
import { withInvoice, emptyMemory } from './projectMemory.ts'
import {
  DIGEST_EVERY_MS,
  digestDue,
  digestRequestFor,
  emptyNotes,
  findInNotes,
  fingerprint,
  indexBoard,
  indexInvoices,
  indexPalette,
  MAX_DIGESTS_CHARS,
  MAX_FOUND_CHARS,
  MAX_FOUND_LINE_CHARS,
  MAX_FOUND_LINES,
  MAX_INDEX_LINES,
  notesForRequest,
  notesSchema,
  printNotes,
  type IndexLine,
  type NotesDoc,
  type WorkspaceNotes,
} from './notes.ts'
import { wordsOf } from './recall.ts'
import { composeRequestSchema } from '../compose/spec.ts'

const t1 = '2026-10-07T10:00:00.000Z'
const t2 = '2026-10-08T10:00:00.000Z'
const note = (id: string, text: string, x = 0, y = 0, extra: Partial<BoardItem> = {}): BoardItem => ({ id, kind: 'note', x, y, w: 200, h: 180, text, colour: 'yellow', author: 'you', ...extra }) as BoardItem
const frame = (id: string, title: string, x = 0, y = 0, w = 800, h = 600): BoardItem => ({ id, kind: 'frame', x, y, w, h, title, colour: 'white' })
// Rand amounts have a non-breaking space in them; a line of notes has plain ones.
const plainRand = (cents: number) => formatRand(cents).replace(/\s+/g, ' ')
const line = (id: string, text: string, extra: Partial<IndexLine> = {}): IndexLine => ({ id, text, at: t1, ...extra })
const workspace = (index: IndexLine[], extra: Partial<WorkspaceNotes> = {}): WorkspaceNotes => ({ index, indexedAt: t1, digest: null, ...extra })

describe('the index of a board', () => {
  it('has every note, shape and text word for word, with the frame it is in and who wrote it', () => {
    const items: BoardItem[] = [
      frame('f', 'Name ideas'),
      note('a', 'Pet Pals', 100, 100),
      note('b', 'Care plan for older dogs', 100, 400, { author: 'ai' } as Partial<BoardItem>),
      { id: 's', kind: 'shape', shape: 'ellipse', x: 2000, y: 2000, w: 200, h: 140, text: 'Loose shape', colour: 'white' },
      { id: 't', kind: 'text', x: 2000, y: 2400, w: 240, h: 60, text: 'A heading', size: 'title' },
    ]
    const index = indexBoard(items, undefined, t1)
    expect(index.map((entry) => [entry.id, entry.text, entry.where, entry.by])).toEqual([
      ['a', 'Pet Pals', 'Name ideas', undefined],
      ['b', 'Care plan for older dogs', 'Name ideas', 'ai'],
      ['s', 'Loose shape', undefined, undefined],
      ['t', 'A heading', undefined, undefined],
    ])
    expect(index.every((entry) => entry.at === t1)).toBe(true)
  })

  it('leaves out an empty prompt, a frame by itself and an arrow: they are not ideas', () => {
    const index = indexBoard([frame('f', 'Ideas'), note('a', '  ', 100, 100), { id: 'c', kind: 'connector', from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, style: 'straight', head: 'end', text: 'leads to' }], undefined, t1)
    expect(index).toEqual([])
  })

  it('keeps the date a thing was added until its words change, and the stars', () => {
    const first = indexBoard([note('a', 'Pet Pals'), note('b', 'Dog walking', 400, 0, { starred: true })], undefined, t1)
    const second = indexBoard([note('a', 'Pet Pals'), note('b', 'Dog walking and sitting', 400, 0, { starred: true }), note('c', 'New one', 800, 0)], first, t2)
    expect(second.map((entry) => [entry.id, entry.at, entry.starred])).toEqual([['a', t1, undefined], ['b', t2, true], ['c', t2, undefined]])
  })

  it('tidies the spaces and cuts a long note, and holds to the most lines, starred first', () => {
    expect(indexBoard([note('a', '  a   b \n c ' + 'x'.repeat(300))], undefined, t1)[0].text).toHaveLength(200)
    const many = Array.from({ length: MAX_INDEX_LINES + 20 }, (_, i) => note(`n${i}`, `Idea ${i}`, (i % 20) * 10, Math.floor(i / 20) * 10, i === 3 ? { starred: true } : {}))
    const index = indexBoard(many, undefined, t1)
    expect(index).toHaveLength(MAX_INDEX_LINES)
    expect(index.some((entry) => entry.id === 'n3')).toBe(true)
  })
})

describe('the index of a palette', () => {
  it('has each colour with its hex, name and role, and its star', () => {
    const index = indexPalette([{ id: 1, hex: '#1F8FE0', name: 'Droplet blue', role: 'primary', starred: true }, { id: 2, hex: '#0B4F8A' }], undefined, t1)
    expect(index.map((entry) => [entry.id, entry.text, entry.starred])).toEqual([['1', '#1F8FE0 Droplet blue (primary)', true], ['2', '#0B4F8A', undefined]])
  })
})

describe('the index of the invoices', () => {
  const content = (over: Record<string, unknown> = {}) => ({
    ...newContent('2026-10-06', 'INV-0007'),
    business: { ...emptyBusiness(), name: 'Kindred Gifting', address: '12 Jacaranda Street', email: 'megan@kindred.co.za', phone: '082 555 1234', accountHolder: 'M Swart', accountNumber: '62012345678', bank: 'FNB', branchCode: '250655' },
    client: { ...emptyClient(), name: 'Pretoria Print Works', address: '5 Church Square', contact: 'Thandi', email: 'thandi@ppw.co.za', vatNumber: '4123456789' },
    lines: [
      { id: 1, description: 'Gift box, small', quantity: 12, unitCents: 45000, starred: true },
      { id: 2, description: 'Delivery', quantity: 1, unitCents: null },
    ],
    ...over,
  })
  const memory = () => withInvoice(emptyMemory(), 'i1', content() as never, t2)

  it('has a headline for each invoice and a line for each line, with the total worked out in code', () => {
    const index = indexInvoices(memory().invoices, undefined)
    expect(index[0]).toMatchObject({ id: 'i:i1', text: `INV-0007 for Pretoria Print Works: ${plainRand(540_000)}, not exported yet`, at: t2 })
    expect(index[1]).toMatchObject({ id: 'l:i1:1', text: `12 × Gift box, small, ${plainRand(45000)} each`, where: 'INV-0007', starred: true })
    expect(index[2]).toMatchObject({ id: 'l:i1:2', text: '1 × Delivery, no price yet' })
  })

  it('says whether it was exported, and whether it changed after', () => {
    const exported = { ...memory().invoices[0], exportedAt: '2026-10-08T11:00:00.000Z', updatedAt: '2026-10-08T10:00:00.000Z' }
    expect(indexInvoices([exported], undefined)[0].text).toMatch(/, exported$/)
    expect(indexInvoices([{ ...exported, updatedAt: '2026-10-09T10:00:00.000Z' }], undefined)[0].text).toMatch(/, changed since it was exported$/)
  })

  it('never holds an address, a contact, an email, a phone number, a VAT number or a bank detail, of the business or of the client', () => {
    const everything = JSON.stringify(indexInvoices(memory().invoices, undefined))
    for (const secret of ['Jacaranda', 'megan@kindred', '082 555', 'Church Square', 'Thandi', 'thandi@', '4123456789', '62012345678', 'FNB', '250655', 'M Swart']) expect(everything).not.toContain(secret)
    expect(everything).toContain('Pretoria Print Works')
  })

  it('leaves out a line with nothing written, and keeps the date until the words change', () => {
    const blank = withInvoice(emptyMemory(), 'i2', newContent('2026-10-06') as never, t2)
    expect(indexInvoices(blank.invoices, undefined).map((entry) => entry.id)).toEqual(['i:i2'])
    const first = indexInvoices(memory().invoices, undefined)
    const later = withInvoice(memory(), 'i1', content({ details: { ...newContent('2026-10-06', 'INV-0007').details, number: 'INV-0007' }, lines: [{ id: 1, description: 'Gift box, small', quantity: 12, unitCents: 45000 }, { id: 2, description: 'Delivery and set-up', quantity: 1, unitCents: null }] }) as never, '2026-10-09T10:00:00.000Z')
    const second = indexInvoices(later.invoices, first)
    expect(second.find((entry) => entry.id === 'l:i1:1')?.at).toBe(t2)
    expect(second.find((entry) => entry.id === 'l:i1:2')?.at).toBe('2026-10-09T10:00:00.000Z')
  })
})

describe('the fingerprint of an index', () => {
  it('changes with the words, the frame and the star, and not with the date', () => {
    const base = [line('a', 'Pet Pals')]
    expect(fingerprint(base)).toBe(fingerprint([line('a', 'Pet Pals', { at: t2 })]))
    expect(fingerprint(base)).not.toBe(fingerprint([line('a', 'Pet Pals!')]))
    expect(fingerprint(base)).not.toBe(fingerprint([line('a', 'Pet Pals', { where: 'Names' })]))
    expect(fingerprint(base)).not.toBe(fingerprint([line('a', 'Pet Pals', { starred: true })]))
  })
})

describe('when a digest is due', () => {
  const index = [line('a', 'Pet Pals')]
  const digest = (over: Record<string, unknown> = {}) => ({ text: 'About: pets', builtAt: t1, basedOn: fingerprint(index), ...over })
  const now = Date.parse(t1) + DIGEST_EVERY_MS + 1

  it('is when there is something indexed and no digest yet', () => {
    expect(digestDue(workspace(index), now)).toBe(true)
  })

  it('is not when there is nothing indexed, or nothing at all', () => {
    expect(digestDue(workspace([]), now)).toBe(false)
    expect(digestDue(undefined, now)).toBe(false)
  })

  it('is not when the index is the one the last digest was written from, however long ago', () => {
    expect(digestDue(workspace(index, { digest: digest() }), now + 99 * DIGEST_EVERY_MS)).toBe(false)
  })

  it('is when the index has changed, but not within five minutes of the last digest', () => {
    const changed = [line('a', 'Pet Pals'), line('b', 'Dog walking')]
    expect(digestDue(workspace(changed, { digest: digest() }), Date.parse(t1) + DIGEST_EVERY_MS - 1)).toBe(false)
    expect(digestDue(workspace(changed, { digest: digest() }), Date.parse(t1) + DIGEST_EVERY_MS)).toBe(true)
  })

  it('is at once when the last try failed, whenever the next save is', () => {
    const changed = [line('a', 'Pet Pals'), line('b', 'Dog walking')]
    expect(digestDue(workspace(changed, { digest: digest(), outOfDate: true }), Date.parse(t1) + 1000)).toBe(true)
  })

  it('is never for a digest the founder wrote', () => {
    const changed = [line('a', 'Pet Pals'), line('b', 'Dog walking')]
    expect(digestDue(workspace(changed, { digest: digest({ edited: true }), outOfDate: true }), now * 2)).toBe(false)
  })
})

describe('the request for a digest', () => {
  it('lists the starred things first and then the newest, each with a reference of its own', () => {
    const index = [line('a', 'Old', { at: '2026-10-01T10:00:00.000Z' }), line('b', 'Newest', { at: '2026-10-08T10:00:00.000Z' }), line('c', 'Starred but old', { at: '2026-09-01T10:00:00.000Z', starred: true, where: 'Names' })]
    const { request, items } = digestRequestFor('board', 'DuckStack', index)
    expect(request).toMatchObject({ kind: 'digest_workspace', workspace: 'board', projectName: 'DuckStack' })
    expect(items.map((item) => [item.ref, item.text])).toEqual([['r1', 'Starred but old'], ['r2', 'Newest'], ['r3', 'Old']])
    expect(items[0]).toMatchObject({ where: 'Names', starred: true })
    expect(request.items).toBe(items)
  })

  it('holds to the most a request holds', () => {
    const index = Array.from({ length: 200 }, (_, i) => line(`n${i}`, `Idea ${i}`))
    expect(digestRequestFor('board', '', index).items).toHaveLength(150)
  })
})

describe('what goes with a message', () => {
  const doc: NotesDoc = {
    board: workspace([line('a', 'Care plan for older dogs', { where: 'Offers', starred: true }), line('b', 'Pet Pals')], { digest: { text: 'About: pet business ideas\nKept in mind: “Care plan for older dogs”', builtAt: t1, basedOn: 'x' } }),
    brand: workspace([line('1', '#1F8FE0 Droplet blue (primary)')], { digest: { text: 'About: a blue palette', builtAt: t1, basedOn: 'y' } }),
  }

  it('is the digests of the workspaces that are not on screen, and not the one that is', () => {
    expect(notesForRequest(doc, { onScreen: 'board', intent: 'hello' })?.digests.map((entry) => entry.workspace)).toEqual(['brand'])
    expect(notesForRequest(doc, { intent: 'hello' })?.digests.map((entry) => entry.workspace)).toEqual(['board', 'brand'])
  })

  it('is nothing when there is nothing to send', () => {
    expect(notesForRequest(emptyNotes(), { intent: 'hello there' })).toBeNull()
    expect(notesForRequest(doc, { onScreen: 'board', intent: 'hello' })).not.toBeNull()
    expect(notesForRequest({ board: doc.board }, { onScreen: 'board', intent: 'what about the dogs' })).toBeNull()
  })

  it('adds the lines of the index that match words the digests do not cover, with where and when', () => {
    const asked = notesForRequest({ ...doc, board: workspace([line('a', 'Dog walking in Brooklyn', { where: 'Offers' })], { digest: doc.board!.digest }) }, { intent: 'What did I say about walking in Brooklyn?' })
    expect(asked?.found).toEqual([{ workspace: 'board', text: '[Offers] Dog walking in Brooklyn', at: '2026-10-07' }])
  })

  it('does not search for words the digests already cover', () => {
    const asked = notesForRequest(doc, { intent: 'tell me about the pet business' })
    expect(asked?.found).toEqual([])
  })

  it('does not search the workspace that is on screen', () => {
    expect(notesForRequest(doc, { onScreen: 'board', intent: 'older dogs care plan' })?.found).toEqual([])
  })

  it('is held to 2,500 characters of digests and 1,000 of found lines', () => {
    const long = (word: string) => workspace([line('a', `${word} ${'y'.repeat(150)}`)], { digest: { text: `About: ${'x'.repeat(1400)}`, builtAt: t1, basedOn: 'z' } })
    const big = notesForRequest({ board: long('alpha'), brand: long('beta'), invoice: long('gamma') }, { intent: 'hello' })!
    expect(big.digests.reduce((total, entry) => total + entry.text.length, 0)).toBeLessThanOrEqual(MAX_DIGESTS_CHARS)
    const many = workspace(Array.from({ length: 80 }, (_, i) => line(`n${i}`, `zebra idea number ${i} ${'q'.repeat(60)}`)))
    const found = findInNotes({ board: many }, wordsOf('zebra'))
    expect(found.reduce((total, entry) => total + entry.text.length, 0)).toBeLessThanOrEqual(MAX_FOUND_CHARS)
    expect(found.length).toBeGreaterThan(5)
  })

  it('ranks the best match first, then the starred, then the newest', () => {
    const doc2: NotesDoc = { board: workspace([line('a', 'Dog walking', { at: '2026-10-01T10:00:00.000Z' }), line('b', 'Dog walking in Brooklyn', { at: '2026-09-01T10:00:00.000Z' }), line('c', 'Dog walking', { at: '2026-10-05T10:00:00.000Z' })]) }
    expect(findInNotes(doc2, wordsOf('dog walking brooklyn')).map((entry) => entry.text)).toEqual(['Dog walking in Brooklyn', 'Dog walking', 'Dog walking'])
    expect(findInNotes(doc2, wordsOf('dog walking brooklyn')).map((entry) => entry.at)).toEqual(['2026-09-01', '2026-10-05', '2026-10-01'])
    expect(findInNotes(doc2, new Set())).toEqual([])
  })

  it('keeps found lines within what the request takes: 40 lines, each up to 300 characters', () => {
    const long = workspace([line('a', `green ${'g'.repeat(234)}`, { where: 'w'.repeat(80), starred: true })])
    const longFound = findInNotes({ board: long }, wordsOf('green'))
    expect(longFound[0].text.length).toBe(MAX_FOUND_LINE_CHARS)
    const short = workspace(Array.from({ length: 80 }, (_, i) => line(`n${i}`, `green ${i}`)))
    expect(findInNotes({ board: short }, wordsOf('green'))).toHaveLength(MAX_FOUND_LINES)
    for (const doc of [{ board: long }, { board: short }]) {
      const notes = notesForRequest(doc, { onScreen: 'brand', intent: 'Give me a green and beige colour palette' })!
      expect(composeRequestSchema.safeParse({ intent: 'Give me a green and beige colour palette', notes }).success).toBe(true)
    }
  })

  it('marks a starred line as kept in mind', () => {
    expect(findInNotes({ board: workspace([line('a', 'Care plan', { starred: true })]) }, wordsOf('care plan'))[0].text).toBe('Care plan (kept in mind)')
  })
})

describe('the notebook as it is kept and shown', () => {
  it('reads back, and reads an empty one as empty', () => {
    const doc: NotesDoc = { board: workspace([line('a', 'Pet Pals')]) }
    expect(notesSchema.safeParse(doc).success).toBe(true)
    expect(notesSchema.safeParse({}).success).toBe(true)
    expect(notesSchema.safeParse({ board: { index: 'no' } }).success).toBe(false)
  })

  it('stays within about 200 KB at its fullest', () => {
    const full = (prefix: string) => workspace(Array.from({ length: MAX_INDEX_LINES }, (_, i) => line(`${prefix}${i}`, 'x'.repeat(200), { where: 'w'.repeat(80), by: 'ai', starred: true })), { digest: { text: 'd'.repeat(1500), builtAt: t1, basedOn: 'abc' } })
    const doc: NotesDoc = { board: full('b'), brand: full('c'), invoice: full('i') }
    expect(notesSchema.safeParse(doc).success).toBe(true)
    expect(JSON.stringify(doc).length).toBeLessThan(230_000)
  })

  it('prints as text, a line each, with the frame and the star', () => {
    expect(printNotes(workspace([line('a', 'Pet Pals', { where: 'Names' }), line('b', 'Care plan', { starred: true })]))).toBe('[Names] Pet Pals\nCare plan (kept in mind)')
  })
})
