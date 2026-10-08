import { describe, expect, it } from 'vitest'
import type { ChatSummary } from '../compose/background.ts'
import type { StoredChat } from './chatStore.ts'
import { MAX_EARLIER_CHARS, MAX_EARLIER_CHATS, needsSummary, selectEarlierChats, welcomeBack, wordsOf } from './recall.ts'

const summary = (over: Partial<ChatSummary> = {}): ChatSummary => ({ task: 'chat', subject: 'Pricing the gift boxes', decided: ['settled on R450 a box'], open: ['whether to offer a discount'], ...over })
const chat = (id: string, updatedAt: string, over: Partial<StoredChat> = {}): StoredChat => ({ id, title: `Chat ${id}`, updatedAt, messages: [{ id: 1, from: 'you', text: 'hello there my friend, how are you' }], ...over })
const said = [{ from: 'you', text: 'I want to call my business Kindred Gifting' }]

describe('whether a chat that was left needs a memory', () => {
  it('does when the founder said something and it has not been written down', () => {
    expect(needsSummary(chat('a', '2026-10-07T10:00:00.000Z'), said)).toBe(true)
  })

  it('does when it has changed since it was written down, and not when it has not', () => {
    expect(needsSummary(chat('a', '2026-10-07T10:00:00.000Z', { summarisedAt: '2026-10-07T09:00:00.000Z' }), said)).toBe(true)
    expect(needsSummary(chat('a', '2026-10-07T10:00:00.000Z', { summarisedAt: '2026-10-07T10:00:00.000Z' }), said)).toBe(false)
    expect(needsSummary(chat('a', '2026-10-07T10:00:00.000Z', { summarisedAt: '2026-10-07T11:00:00.000Z' }), said)).toBe(false)
  })

  it('does not when the founder wrote the memory themselves, or the chat is not kept, or nothing was said', () => {
    expect(needsSummary(chat('a', '2026-10-07T10:00:00.000Z', { summaryEdited: true }), said)).toBe(false)
    expect(needsSummary(undefined, said)).toBe(false)
    expect(needsSummary(chat('a', '2026-10-07T10:00:00.000Z'), [])).toBe(false)
    expect(needsSummary(chat('a', '2026-10-07T10:00:00.000Z'), [{ from: 'droplet', text: 'Hello, welcome to Droplet, how can I help today?' }])).toBe(false)
  })

  it('does not for a bare hello', () => {
    expect(needsSummary(chat('a', '2026-10-07T10:00:00.000Z'), [{ from: 'you', text: 'hi' }])).toBe(false)
  })
})

describe('the words of a request', () => {
  it('are the ordinary words of four letters or more, without the filler', () => {
    expect([...wordsOf('Can you help me with the pricing of my gift boxes, please?')].sort()).toEqual(['boxes', 'gift', 'pricing'])
  })
})

describe('the memories sent with a message', () => {
  const old = chat('old', '2026-10-01T10:00:00.000Z', { summary: summary({ task: 'brand', subject: 'Choosing colours for the packaging' }) })
  const mid = chat('mid', '2026-10-04T10:00:00.000Z', { summary: summary({ task: 'ideation', subject: 'Names for the business' }) })
  const recent = chat('recent', '2026-10-06T10:00:00.000Z', { summary: summary({ task: 'chat', subject: 'Pricing the gift boxes' }) })
  const none = chat('none', '2026-10-07T10:00:00.000Z')

  it('are at most three, with the date, and only of chats that have one', () => {
    const picked = selectEarlierChats([none, recent, mid, old, chat('x', '2026-09-01T10:00:00.000Z', { summary: summary({ subject: 'Older still' }) })], { intent: 'hello' })
    expect(picked).toHaveLength(MAX_EARLIER_CHATS)
    expect(picked[0].when).toBe('2026-10-06')
    expect(picked.map((entry) => entry.when)).toEqual(['2026-10-06', '2026-10-04', '2026-10-01'])
    expect(picked[0].text).toBe('About: Pricing the gift boxes; Decided: settled on R450 a box; Still open: whether to offer a discount')
  })

  it('put a chat about the same task first', () => {
    const picked = selectEarlierChats([recent, mid, old], { intent: 'hello', task: 'brand' })
    expect(picked[0].when).toBe('2026-10-01')
    expect(picked[1].when).toBe('2026-10-06')
  })

  it('put a chat that shares words with the request next, and then the most recent', () => {
    const picked = selectEarlierChats([recent, mid, old], { intent: 'What names did we think of for the business?' })
    expect(picked[0].when).toBe('2026-10-04')
    expect(picked[1].when).toBe('2026-10-06')
  })

  it('leave out the chat the founder is in', () => {
    expect(selectEarlierChats([recent, mid], { intent: 'hello', currentChatId: 'recent' }).map((entry) => entry.when)).toEqual(['2026-10-04'])
  })

  it('are held to 1,200 characters, and a memory to 400', () => {
    const long = (id: string, date: string) => chat(id, date, { summary: summary({ subject: 'S'.repeat(100), decided: ['d'.repeat(120), 'e'.repeat(120), 'f'.repeat(120), 'g'.repeat(120)], open: ['o'.repeat(120), 'p'.repeat(120)] }) })
    const picked = selectEarlierChats([long('a', '2026-10-06T10:00:00.000Z'), long('b', '2026-10-05T10:00:00.000Z'), long('c', '2026-10-04T10:00:00.000Z')], { intent: 'hello' })
    for (const entry of picked) expect(entry.text.length).toBeLessThanOrEqual(400)
    expect(picked.reduce((total, entry) => total + entry.text.length, 0)).toBeLessThanOrEqual(MAX_EARLIER_CHARS)
  })

  it('are none when there is none, and none for chats without a memory', () => {
    expect(selectEarlierChats([], { intent: 'hello' })).toEqual([])
    expect(selectEarlierChats([none], { intent: 'hello' })).toEqual([])
  })
})

describe('welcoming a founder back', () => {
  const input = { projectName: 'DuckStack', facts: { 'business.name': 'Kindred Gifting' } as const, summary: summary({ task: 'brand', subject: 'Naming and the first colours', decided: ['settled the name', 'started on colours'], open: ['the palette is not saved'] }), hasPalette: false, invoices: 0, boardItems: 0 }

  it('says where they left off and what is not saved, in the business\'s name', () => {
    const welcome = welcomeBack(input)
    expect(welcome.text).toBe('Welcome back to Kindred Gifting. Last time you settled the name and started on colours, and the palette is not saved yet.')
    expect(welcome.question).toBe('Shall we carry on?')
    expect(welcome.replies).toEqual(['Carry on with the colours', 'Something else'])
  })

  it('uses the project\'s name when the business has none, and leaves out the saved note when it is saved', () => {
    const welcome = welcomeBack({ ...input, facts: {}, hasPalette: true })
    expect(welcome.text).toBe('Welcome back to DuckStack. Last time you settled the name and started on colours, and the palette is not saved.')
  })

  it('offers the step that goes with what the chat was about', () => {
    expect(welcomeBack({ ...input, summary: summary({ task: 'invoice' }) }).replies[0]).toBe('Carry on with the invoice')
    expect(welcomeBack({ ...input, summary: summary({ task: 'ideation' }) }).replies[0]).toBe('Carry on with the board')
    expect(welcomeBack({ ...input, summary: summary({ task: 'logo' }) }).replies[0]).toBe('Carry on with the logo')
  })

  it('says an invoice or a board is not saved when it is not, from what is saved', () => {
    expect(welcomeBack({ ...input, summary: summary({ task: 'invoice', decided: ['started an invoice'], open: [] }) }).text).toMatch(/and the invoice is not saved yet\.$/)
    expect(welcomeBack({ ...input, summary: summary({ task: 'invoice', decided: ['started an invoice'], open: [] }), invoices: 1 }).text).not.toMatch(/not saved/)
    expect(welcomeBack({ ...input, summary: summary({ task: 'ideation', decided: ['jotted ideas'], open: [] }) }).text).toMatch(/nothing from the board is saved yet\.$/)
  })

  it('falls back to what the chat was about when nothing was decided, and offers only Something else when there is no step', () => {
    const welcome = welcomeBack({ ...input, summary: summary({ task: 'chat', subject: 'Pricing the gift boxes', decided: [], open: [] }), hasPalette: true })
    expect(welcome.text).toBe('Welcome back to Kindred Gifting. Last time you were on pricing the gift boxes.')
    expect(welcome.replies).toEqual(['Something else'])
  })

  it('has no em dashes and says nothing of the founder\'s that was not written down', () => {
    expect(welcomeBack(input).text).not.toMatch(/—|–/)
  })
})
