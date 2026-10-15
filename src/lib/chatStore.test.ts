import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_CHATS, chatHasBegun, chatSchema, chatTitle, cleanTitle, whenLabel, hasFounderMessage, lastActive, loadChats, pinChat, removeChat, saveChats, storableMessages, upsertChat, type StoredChat } from './chatStore.ts'

const chat = (id: string, updatedAt: string, text = 'Hello'): StoredChat => ({ id, title: text, updatedAt, messages: [{ id: 1, from: 'you', text }] })

beforeEach(() => window.localStorage.clear())

describe('storableMessages', () => {
  it('keeps the words, and drops a reply still being worked on and the buttons a message carried', () => {
    const kept = storableMessages([
      { id: 1, from: 'you', text: 'Hello' },
      { id: 2, from: 'droplet', text: '', pending: true },
      { id: 3, from: 'droplet', text: 'Save first?', local: true, actions: [{ id: 'leave' }] } as never,
      { id: 4, from: 'divider', text: 'Switched workspace to Invoice' },
    ])
    expect(kept).toEqual([
      { id: 1, from: 'you', text: 'Hello' },
      { id: 3, from: 'droplet', text: 'Save first?', local: true },
      { id: 4, from: 'divider', text: 'Switched workspace to Invoice' },
    ])
  })
})

describe('a question Droplet asked', () => {
  it('is kept with the message, but the replies it suggested are not', () => {
    const kept = storableMessages([{ id: 1, from: 'droplet', text: 'Three ways to price.', question: 'Do you know your costs?', replies: ['Yes', 'No'] } as never])
    expect(kept).toEqual([{ id: 1, from: 'droplet', text: 'Three ways to price.', question: 'Do you know your costs?' }])
  })

  it('comes back from storage', async () => {
    await saveChats('p', [{ id: 'c', title: 'x', updatedAt: '2026-10-04T10:00:00.000Z', messages: [{ id: 1, from: 'droplet', text: 'Hi', question: 'Ready?' }] }])
    expect((await loadChats('p'))[0].messages[0].question).toBe('Ready?')
  })
})

describe('a table or a checklist Droplet showed', () => {
  const blocks = [
    { type: 'checklist' as const, title: 'Your plan', numbered: true, items: [{ label: 'Settle the name', step: 'name' as const }, { label: 'Get a logo', step: 'logo' as const }] },
    { type: 'table' as const, columns: ['Name', 'Feel'], rows: [['DuckStack', 'Playful']] },
  ]

  it('is kept with the message, with the ticks the founder made, and nothing is added when there are none', () => {
    const kept = storableMessages([
      { id: 1, from: 'droplet', text: 'Your plan.', blocks, checks: { '0:1': true } },
      { id: 2, from: 'droplet', text: 'Plain.', blocks: [], checks: {} },
    ])
    expect(kept).toEqual([{ id: 1, from: 'droplet', text: 'Your plan.', blocks, checks: { '0:1': true } }, { id: 2, from: 'droplet', text: 'Plain.' }])
  })

  it('comes back from storage whole', async () => {
    await saveChats('p', [{ id: 'c', title: 'x', updatedAt: '2026-10-04T10:00:00.000Z', messages: [{ id: 1, from: 'droplet', text: 'Your plan.', blocks, checks: { '0:1': true } }] }])
    expect((await loadChats('p'))[0].messages[0]).toEqual({ id: 1, from: 'droplet', text: 'Your plan.', blocks, checks: { '0:1': true } })
  })

  it('leaves out a chat whose blocks cannot be read, and keeps the rest', async () => {
    const bad = { id: 'bad', title: 'x', updatedAt: '2026-10-04T10:00:00.000Z', messages: [{ id: 1, from: 'droplet', text: 'x', blocks: [{ type: 'html', html: '<b>x</b>' }] }] }
    await saveChats('p', [bad as never, chat('good', '2026-10-04T11:00:00.000Z')])
    expect((await loadChats('p')).map((entry) => entry.id)).toEqual(['good'])
  })
})

describe('cleanTitle', () => {
  it('tidies a title from the composer to one plain line', () => {
    expect(cleanTitle('  "Pricing gift boxes."  ')).toBe('Pricing gift boxes')
    expect(cleanTitle('**Warm brand palette**')).toBe('Warm brand palette')
    expect(cleanTitle('Naming\nthe business!')).toBe('Naming the business')
    expect(cleanTitle('# `Pricing` _boxes_')).toBe('Pricing boxes')
  })

  it('is empty when nothing is left, and cut short with an ellipsis when long', () => {
    expect(cleanTitle('  "." ')).toBe('')
    expect(cleanTitle('')).toBe('')
    const long = cleanTitle('a'.repeat(200))
    expect(long).toHaveLength(60)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('a chat the composer named', () => {
  it('comes back from storage marked as named, and a chat without the mark still reads', async () => {
    await saveChats('p', [{ ...chat('a', '2026-10-04T10:00:00.000Z'), title: 'Pricing gift boxes', named: true }, chat('b', '2026-10-03T10:00:00.000Z')])
    const loaded = await loadChats('p')
    expect(loaded[0]).toMatchObject({ title: 'Pricing gift boxes', named: true })
    expect(loaded[1].named).toBeUndefined()
  })
})

describe('chatTitle', () => {
  it('is how the conversation began, on one line', () => {
    expect(chatTitle([{ from: 'droplet', text: 'Hi' }, { from: 'you', text: '  Name   my\n business  ' }])).toBe('Name my business')
  })

  it('is cut short with an ellipsis when it is long, and says "New chat" when nothing has been said', () => {
    const long = chatTitle([{ from: 'you', text: 'a'.repeat(200) }])
    expect(long).toHaveLength(60)
    expect(long.endsWith('…')).toBe(true)
    expect(chatTitle([])).toBe('New chat')
  })
})

describe('hasFounderMessage', () => {
  it('is true only once the founder has said something', () => {
    expect(hasFounderMessage([{ from: 'droplet' }, { from: 'divider' }])).toBe(false)
    expect(hasFounderMessage([{ from: 'you' }])).toBe(true)
  })
})

describe('upsertChat and removeChat', () => {
  it('adds a chat, replaces one that is there, and keeps the newest first', () => {
    let chats = upsertChat([], chat('a', '2026-10-01T10:00:00'))
    chats = upsertChat(chats, chat('b', '2026-10-02T10:00:00'))
    chats = upsertChat(chats, chat('a', '2026-10-03T10:00:00', 'Changed'))
    expect(chats.map((item) => item.id)).toEqual(['a', 'b'])
    expect(chats[0].title).toBe('Changed')
    expect(chats).toHaveLength(2)
  })

  it('keeps only so many, dropping the oldest', () => {
    let chats: StoredChat[] = []
    for (let day = 0; day < MAX_CHATS + 5; day++) chats = upsertChat(chats, chat(`c${day}`, new Date(Date.UTC(2026, 0, 1 + day)).toISOString()))
    // the five oldest are the ones that go
    expect(chats.some((item) => item.id === 'c0')).toBe(false)
    expect(chats[0].id).toBe(`c${MAX_CHATS + 4}`)
    expect(chats).toHaveLength(MAX_CHATS)
  })

  it('forgets one chat by its id', () => {
    expect(removeChat([chat('a', 'x'), chat('b', 'y')], 'a').map((item) => item.id)).toEqual(['b'])
  })
})

describe('loadChats and saveChats', () => {
  it('keeps chats for the project they belong to, and no others', async () => {
    expect(await saveChats('duckstack', [chat('a', '2026-10-01T10:00:00')])).toBe(true)
    expect((await loadChats('duckstack')).map((item) => item.id)).toEqual(['a'])
    expect(await loadChats('other')).toEqual([])
  })

  it('reads nothing from storage that is not chats, and leaves out one chat that cannot be read', async () => {
    window.localStorage.setItem('droplet-project-duckstack-chats', '{not json')
    expect(await loadChats('duckstack')).toEqual([])
    window.localStorage.setItem('droplet-project-duckstack-chats', JSON.stringify({ not: 'a list' }))
    expect(await loadChats('duckstack')).toEqual([])
    window.localStorage.setItem('droplet-project-duckstack-chats', JSON.stringify([chat('a', 'x'), { id: 'broken', messages: 'no' }, chat('b', 'y')]))
    expect((await loadChats('duckstack')).map((item) => item.id)).toEqual(['a', 'b'])
  })
})

describe('whenLabel', () => {
  const now = new Date(2026, 9, 5, 15, 0)

  it('says today and yesterday with the time, and an older day by its date', () => {
    expect(whenLabel(new Date(2026, 9, 5, 9, 5).toISOString(), now)).toBe('Today, 09:05')
    expect(whenLabel(new Date(2026, 9, 4, 22, 30).toISOString(), now)).toBe('Yesterday, 22:30')
    expect(whenLabel(new Date(2026, 8, 28, 10, 0).toISOString(), now)).toMatch(/28/)
  })

  it('says nothing for a date it cannot read', () => {
    expect(whenLabel('not a date', now)).toBe('')
  })
})

describe('a change receipt kept with a reply', () => {
  const receipt = { heading: 'Changed on the board', lines: [{ mark: '+' as const, text: '5 notes in “Name ideas”' }], left: ['Adding a note: no room.'], status: 'Undone. It is as it was before this reply.' }

  it('is kept with the message, the lines and what Undo this said, and not the ability to undo', () => {
    const kept = storableMessages([{ id: 1, from: 'droplet', text: 'Done.', receipt, ...({ receiptLive: { undo: true, show: true } } as object) }])
    expect(kept).toEqual([{ id: 1, from: 'droplet', text: 'Done.', receipt }])
    expect(JSON.stringify(kept)).not.toContain('receiptLive')
  })

  it('comes back with the chat, and a receipt that is not one is left out without losing the message', async () => {
    await saveChats('p1', [{ id: 'c1', title: 'Board', updatedAt: '2026-10-06T10:00:00.000Z', messages: [{ id: 1, from: 'droplet', text: 'Done.', receipt }] }])
    expect((await loadChats('p1'))[0].messages[0].receipt).toEqual(receipt)
    window.localStorage.clear()
    await saveChats('p1', [{ id: 'c1', title: 'Board', updatedAt: '2026-10-06T10:00:00.000Z', messages: [{ id: 1, from: 'droplet', text: 'Done.', receipt: { heading: 5 } as never }] }])
    // the chat as a whole could not be read, and is left out, as for any other bad part of a message
    expect(await loadChats('p1')).toEqual([])
  })

  it('is held to the same limits when it is read back', async () => {
    const tooMany = { ...receipt, lines: Array.from({ length: 31 }, () => ({ mark: '' as const, text: 'x' })) }
    await saveChats('p1', [{ id: 'c1', title: 'Board', updatedAt: '2026-10-06T10:00:00.000Z', messages: [{ id: 1, from: 'droplet', text: 'Done.', receipt: tooMany }] }])
    expect(await loadChats('p1')).toEqual([])
  })

  it('is not kept for a message with no words, as for any other', () => {
    expect(storableMessages([{ id: 1, from: 'droplet', text: '  ', receipt }])).toEqual([])
  })
})

describe('the memory of a chat kept with it', () => {
  const summary = { task: 'ideation' as const, subject: 'Naming the business', decided: ['settled on the name Kindred Gifting'], open: ['the colours are not chosen yet'] }

  it('comes back with the chat, with when it was written and whether the founder wrote it', async () => {
    await saveChats('p1', [{ ...chat('c1', '2026-10-06T10:00:00.000Z'), summary, summarisedAt: '2026-10-06T11:00:00.000Z', summaryEdited: true }])
    expect((await loadChats('p1'))[0]).toMatchObject({ summary, summarisedAt: '2026-10-06T11:00:00.000Z', summaryEdited: true })
  })

  it('is optional, so a chat from before memories is still read', async () => {
    await saveChats('p1', [chat('c1', '2026-10-06T10:00:00.000Z')])
    const read = (await loadChats('p1'))[0]
    expect(read.summary).toBeUndefined()
    expect(read.summarisedAt).toBeUndefined()
  })

  it('is held to the same limits when read back: a memory with too many lines leaves the chat out', async () => {
    await saveChats('p1', [{ ...chat('c1', '2026-10-06T10:00:00.000Z'), summary: { ...summary, decided: ['a', 'b', 'c', 'd', 'e'] } }])
    expect(await loadChats('p1')).toEqual([])
  })
})

describe('lastActive', () => {
  it('is the time of the founder’s newest message, not of a reply or a note', () => {
    const messages = [
      { from: 'you', at: '2026-10-08T10:00:00.000Z' },
      { from: 'droplet', at: '2026-10-08T10:05:00.000Z' },
    ]
    expect(lastActive(messages)).toBe('2026-10-08T10:00:00.000Z')
  })

  it('keeps what was kept before when the messages have no times, or older ones', () => {
    expect(lastActive([{ from: 'you' }], '2026-10-01T09:00:00.000Z')).toBe('2026-10-01T09:00:00.000Z')
    expect(lastActive([{ from: 'you', at: '2026-09-01T09:00:00.000Z' }], '2026-10-01T09:00:00.000Z')).toBe('2026-10-01T09:00:00.000Z')
    expect(lastActive([{ from: 'droplet' }])).toBeUndefined()
  })

  it('keeps the time a message was sent when it is stored', () => {
    expect(storableMessages([{ id: 1, from: 'you', text: 'Hi', at: '2026-10-08T10:00:00.000Z' }])[0].at).toBe('2026-10-08T10:00:00.000Z')
  })
})

describe('pinning a chat', () => {
  it('lists pinned chats first, keeps their time, and unpins', () => {
    const chats = [chat('a', '2026-10-08T10:00:00.000Z'), chat('b', '2026-10-01T10:00:00.000Z')]
    const pinned = pinChat(chats, 'b', true)
    expect(pinned.map((entry) => entry.id)).toEqual(['b', 'a'])
    expect(pinned[0]).toMatchObject({ pinned: true, updatedAt: '2026-10-01T10:00:00.000Z' })
    const unpinned = pinChat(pinned, 'b', false)
    expect(unpinned.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(unpinned[1]).not.toHaveProperty('pinned')
  })

  it('keeps a pinned chat first when another is saved', () => {
    const chats = pinChat([chat('a', '2026-10-01T10:00:00.000Z')], 'a', true)
    expect(upsertChat(chats, chat('b', '2026-10-08T10:00:00.000Z')).map((entry) => entry.id)).toEqual(['a', 'b'])
  })
})

describe('a chat with a finished task in it', () => {
  const result = { invoiceId: 'inv-1', title: 'Invoice', number: 'INV-0007', client: 'Karoo Candles', totalCents: 255_000, issueDate: '2026-10-10', dueDate: '2026-10-24', lines: 1 }

  it('is kept even when nothing was typed, and is called after what was finished', () => {
    const messages = [{ id: 1, from: 'droplet' as const, text: 'Invoice INV-0007 for Karoo Candles is finished and saved.', result }]
    expect(hasFounderMessage(messages)).toBe(false)
    expect(chatHasBegun(messages)).toBe(true)
    const greeting = [{ id: 1, from: 'droplet' as const, text: 'Hello' }]
    expect(chatHasBegun(greeting)).toBe(false)
    expect(chatTitle(messages)).toBe('Invoice INV-0007')
  })

  it('keeps the card with the message, and reads it back', () => {
    const stored = storableMessages([{ id: 1, from: 'droplet', text: 'Finished.', result }])
    expect(stored[0].result).toEqual(result)
    const chat = { id: 'c1', title: 'Invoice INV-0007', updatedAt: '2026-10-10T08:00:00.000Z', messages: stored }
    expect(chatSchema.parse(chat).messages[0].result).toEqual(result)
  })

  it('refuses a card that is not one', () => {
    const chat = { id: 'c1', title: 'x', updatedAt: '2026-10-10T08:00:00.000Z', messages: [{ id: 1, from: 'droplet', text: 'x', result: { invoiceId: 'inv-1', totalCents: -5 } }] }
    expect(chatSchema.safeParse(chat).success).toBe(false)
  })
})

describe('a chat with a finished palette in it', () => {
  const palette = {
    kind: 'palette' as const,
    title: 'Brand palette',
    colours: [
      { hex: '#1F8FE0', role: 'primary' as const },
      { hex: '#0B4F8A', role: 'accent' as const },
      { hex: '#CFE9FB', role: 'background' as const },
      { hex: '#0E1A2B', role: 'text' as const },
    ],
    ratio: 13.9,
    level: 'AAA' as const,
  }
  const invoice = { invoiceId: 'inv-1', title: 'Invoice', number: 'INV-0007', client: 'Karoo Candles', totalCents: 255_000, issueDate: '2026-10-10', dueDate: '2026-10-24', lines: 1 }

  it('is kept, is called after what was finished, and the card is kept with the message', () => {
    const messages = [{ id: 1, from: 'droplet' as const, text: 'The brand palette is finished and saved.', result: palette }]
    expect(chatHasBegun(messages)).toBe(true)
    expect(chatTitle(messages)).toBe('Brand palette')
    const stored = storableMessages([{ id: 1, from: 'droplet', text: 'Finished.', result: palette }])
    expect(stored[0].result).toEqual(palette)
    const chat = { id: 'c1', title: 'Brand palette', updatedAt: '2026-10-10T08:00:00.000Z', messages: stored }
    expect(chatSchema.parse(chat).messages[0].result).toEqual(palette)
  })

  it('still reads a chat saved when only invoices had a card, which has no kind', () => {
    const old = { id: 'c1', title: 'Invoice INV-0007', updatedAt: '2026-10-10T08:00:00.000Z', messages: [{ id: 1, from: 'droplet', text: 'Finished.', result: invoice }] }
    expect(chatSchema.parse(old).messages[0].result).toEqual(invoice)
  })

  it('reads an invoice card and a palette card in the same chat', () => {
    const chat = {
      id: 'c1',
      title: 'x',
      updatedAt: '2026-10-10T08:00:00.000Z',
      messages: [
        { id: 1, from: 'droplet', text: 'a', result: palette },
        { id: 2, from: 'droplet', text: 'b', result: invoice },
      ],
    }
    const parsed = chatSchema.parse(chat)
    expect(parsed.messages[0].result).toEqual(palette)
    expect(parsed.messages[1].result).toEqual(invoice)
  })

  it('refuses a palette card with a colour that is not a hex code, too few colours, or no ratio', () => {
    const bad = (result: unknown) => chatSchema.safeParse({ id: 'c1', title: 'x', updatedAt: '2026-10-10T08:00:00.000Z', messages: [{ id: 1, from: 'droplet', text: 'x', result }] }).success
    expect(bad({ ...palette, colours: [{ hex: 'blue' }, { hex: '#FFFFFF' }] })).toBe(false)
    expect(bad({ ...palette, colours: [{ hex: '#FFFFFF' }] })).toBe(false)
    const { ratio: _ratio, ...noRatio } = palette
    expect(bad(noRatio)).toBe(false)
    expect(bad(palette)).toBe(true)
  })
})
