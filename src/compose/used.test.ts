import { describe, expect, it } from 'vitest'
import { chatTurn } from './fixtures.ts'
import { NOT_SENT, usedLine, usedOf, usedSchema, workingFrom } from './used.ts'
import { buildUserContent } from './prompt.ts'
import type { ComposeRequest } from './spec.ts'
import { snapshotOfProject } from './project.ts'
import { emptyMemory, withFact, withIdea, withInvoice } from '../lib/projectMemory.ts'
import { newContent } from '../lib/invoice.ts'
import { snapshotOfLibrary } from './librarySnapshot.ts'
import { libraryOf } from '../lib/library.ts'

void chatTurn

const labels = (request: ComposeRequest, options?: { searched?: string[] }) => usedOf(request, options).items.map((item) => item.label)

const colours = [{ hex: '#0E1A2B', role: 'text' as const }, { hex: '#F4F8FB', role: 'background' as const }]
const workspace = { blocks: [{ id: 1, hex: '#0E1A2B' }, { id: 2, hex: '#F4F8FB' }], selectedId: 1, harmony: 'analogous', components: [], arrangement: { shelf: [], windows: [] }, canUndo: false, canRedo: false, saved: 'none' } as unknown as NonNullable<ComposeRequest['workspace']>

describe('what Droplet used', () => {
  it('is only the message when nothing else went with it, and the line says so', () => {
    const used = usedOf({ intent: 'hello' })
    expect(used.items).toEqual([])
    expect(usedLine(used)).toBe('Used: only your message')
  })

  it('lists the chat, the saved palette and the palette on screen', () => {
    const request: ComposeRequest = { intent: 'warmer', history: [{ role: 'founder', text: 'a palette' }, { role: 'droplet', text: 'here' }], view: 'brand', workspace, memory: { colours } }
    expect(labels(request)).toEqual(['This chat', 'The palette on screen', 'Your saved palette'])
    expect(usedOf(request).items[0].detail).toBe('The 2 messages before this one, so a follow-up makes sense.')
  })

  it('names the project things sent, as counts, never what is in them', () => {
    let memory = withIdea(emptyMemory(), 'name', 'Kindred Gifting', '2026-10-05T10:00:00.000Z')
    memory = withIdea(memory, 'offer', 'Corporate gift boxes', '2026-10-05T10:00:00.000Z')
    memory = withFact(memory, 'brand.values', 'Warm, trusted, local', '2026-10-05T10:00:00.000Z')
    memory = withInvoice(memory, 'i1', newContent('2026-10-04', 'INV-0001'), '2026-10-05T10:00:00.000Z')
    const project = snapshotOfProject({ projectName: 'Kindred', memory, hasPalette: true, boardItems: 14 })
    const used = usedOf({ intent: 'hi', project })
    expect(used.items.map((item) => item.label)).toEqual(['Business name', 'Offer', 'What you told me about the business', 'What is saved'])
    expect(used.items[3].detail).toBe('Only that there are a palette, 14 things on the board, 1 invoice, business details: counts, not what is in them.')
  })

  it('lists saved invoices by number and client, and says no amounts', () => {
    const memory = withInvoice(emptyMemory(), 'i1', newContent('2026-10-04', 'INV-0001'), '2026-10-05T10:00:00.000Z')
    const library = snapshotOfLibrary(libraryOf({ palette: null, board: null, memory, notes: {} }))
    const used = usedOf({ intent: 'hi', library })
    expect(labels({ intent: 'hi', library })).toEqual(['Your saved invoices'])
    expect(used.items[0].detail).toMatch(/No amounts/)
  })

  it('says how many earlier chats, and from when', () => {
    expect(labels({ intent: 'hi', earlierChats: [{ when: '10 October', text: 'x' }] })).toEqual(['An earlier chat'])
    const two = usedOf({ intent: 'hi', earlierChats: [{ when: '10 October', text: 'x' }, { when: '12 October', text: 'y' }] })
    expect(two.items[0]).toMatchObject({ label: '2 earlier chats' })
    expect(two.items[0].detail).toContain('10 October, 12 October')
  })

  it('names the notes it was given, by workspace and with the dates of the lines', () => {
    const used = usedOf({ intent: 'hi', notes: { digests: [{ workspace: 'board', text: 'about names' }], found: [{ workspace: 'board', text: 'Marula Bakes', at: '13 October' }] } })
    expect(used.items.map((item) => item.label)).toEqual(['Notes on the board', 'Lines from your notes'])
    expect(used.items[1].detail).toContain('13 October')
  })

  it('lists the web search only when it happened, with what it searched for', () => {
    expect(labels({ intent: 'hi', mode: 'advanced' })).toEqual([])
    const used = usedOf({ intent: 'hi', mode: 'advanced' }, { searched: ['CIPC registration fee'] })
    expect(used.items[0]).toMatchObject({ label: 'Google Search' })
    expect(used.items[0].detail).toContain('“CIPC registration fee”')
  })

  it('describes the invoice on screen without any address, contact or bank detail, and the guide step when there is one', () => {
    const invoice = { today: '2026-10-15', kind: 'invoice', number: 'INV-0001', issueDate: '2026-10-15', terms: 'days_30', customDueDate: '', dueDate: '2026-11-14', notes: '', vatRegistered: false, business: { name: 'K', hasAddress: true, hasContact: true, hasBankDetails: true }, client: { name: 'P', hasAddress: true }, savedClients: [], lines: [{ description: 'Box', quantity: 1, unitCents: 100 }], needs: [], canUndo: false, canRedo: false } as unknown as NonNullable<ComposeRequest['invoice']>
    const used = usedOf({ intent: 'hi', view: 'invoice', invoice, guide: { step: 'client', position: 3, of: 6 } })
    expect(used.items[0].label).toBe('The invoice on screen')
    expect(used.items[0].detail).toContain('guide step you are on (3 of 6)')
    expect(used.items[0].detail).toContain('No addresses, contact details or bank details')
  })

  it('matches what the prompt really contains, for every kind of thing it lists', () => {
    const memory = withFact(withIdea(emptyMemory(), 'name', 'Kindred Gifting', '2026-10-05T10:00:00.000Z'), 'brand.values', 'Warm', '2026-10-05T10:00:00.000Z')
    const request: ComposeRequest = {
      intent: 'hi',
      history: [{ role: 'founder', text: 'earlier words' }],
      memory: { colours },
      project: snapshotOfProject({ projectName: 'Kindred', memory, hasPalette: true, boardItems: 0 }),
      earlierChats: [{ when: '10 October', text: 'memory of a chat' }],
      notes: { digests: [{ workspace: 'board', text: 'digest text' }], found: [] },
    }
    const prompt = buildUserContent(request)
    const used = labels(request)
    // each thing listed is in the prompt...
    expect(prompt).toContain('earlier words')
    expect(prompt).toContain('<saved_palette>')
    expect(prompt).toContain('Kindred Gifting')
    expect(prompt).toContain('memory of a chat')
    expect(prompt).toContain('digest text')
    expect(used).toEqual(['This chat', 'Your saved palette', 'Business name', 'What you told me about the business', 'What is saved', 'An earlier chat', 'Notes on the board'])
    // ...and a request without them lists none of them
    expect(labels({ intent: 'hi' })).toEqual([])
  })

  it('is valid data for the saved chat, and the not-sent line always says what is never sent', () => {
    expect(usedSchema.safeParse(usedOf({ intent: 'hi', history: [{ role: 'founder', text: 'x' }] })).success).toBe(true)
    expect(NOT_SENT).toMatch(/addresses, contact details and bank details/)
  })
})

describe('what it is working from, in words', () => {
  it('is nothing when only the message went', () => {
    expect(workingFrom(usedOf({ intent: 'hello' }))).toBe('')
  })

  it('names what went, as a phrase, from the same list as the line under the reply', () => {
    const request: ComposeRequest = { intent: 'hi', history: [{ role: 'founder', text: 'x' }], memory: { colours }, earlierChats: [{ when: '10 October', text: 'a' }, { when: '12 October', text: 'b' }] }
    expect(workingFrom(usedOf(request))).toBe('this chat, your saved palette and 2 earlier chats')
  })

  it('names at most three things and counts the rest, and leaves out counts-only items', () => {
    const memory = withFact(withIdea(emptyMemory(), 'name', 'Kindred Gifting', '2026-10-05T10:00:00.000Z'), 'brand.values', 'Warm', '2026-10-05T10:00:00.000Z')
    const project = snapshotOfProject({ projectName: 'K', memory, hasPalette: true, boardItems: 3 })
    const request: ComposeRequest = { intent: 'hi', history: [{ role: 'founder', text: 'x' }], memory: { colours }, project, earlierChats: [{ when: '10 October', text: 'a' }], notes: { digests: [{ workspace: 'board', text: 'd' }], found: [] } }
    const phrase = workingFrom(usedOf(request))
    expect(phrase).toBe('this chat, your saved palette, your business name and 3 more')
    expect(phrase).not.toMatch(/saved\b.*counts/)
  })

  it('names the notes it was given by workspace', () => {
    expect(workingFrom(usedOf({ intent: 'hi', notes: { digests: [{ workspace: 'board', text: 'd' }], found: [] } }))).toBe('my notes on the board')
  })
})

describe('files attached to a message', () => {
  const file = { kind: 'text' as const, name: 'notes.md', text: 'Kindred Gifting' }

  it('are listed by name, as sent whole, with the plain warning that what is inside was read', () => {
    const used = usedOf({ intent: 'read this', attachments: [file] })
    expect(used.items[0].label).toBe('A file you attached')
    expect(used.items[0].detail).toContain('notes.md')
    expect(used.items[0].detail).toMatch(/sent whole.*private details included.*Not kept/)
    expect(JSON.stringify(used)).not.toContain('Kindred Gifting')
  })

  it('are counted when there are several, and named in what it is working from', () => {
    const two = usedOf({ intent: 'read these', attachments: [file, { ...file, name: 'more.md' }] })
    expect(two.items[0].label).toBe('2 files you attached')
    expect(workingFrom(two)).toBe('the files you attached')
  })
})
