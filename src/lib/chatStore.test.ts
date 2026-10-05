import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_CHATS, chatTitle, cleanTitle, whenLabel, hasFounderMessage, loadChats, removeChat, saveChats, storableMessages, upsertChat, type StoredChat } from './chatStore.ts'

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
