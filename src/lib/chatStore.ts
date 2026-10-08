import { z } from 'zod'
import { blockSchema, MAX_BLOCKS, type ChatBlock } from '../compose/blocks.ts'
import { groundingSchema, type Grounding } from '../compose/grounding.ts'
import { summarySchema } from '../compose/background.ts'
import { receiptSchema, type Receipt } from '../compose/receipt.ts'
import { documentStorage } from './storage.ts'

// The conversations of a project, kept in this browser so the founder can come back to one. Per project, newest first. Only what was
// said is kept: a reply still being worked on, and the buttons a message carried, are not, since neither means anything later.
// Everything read back is validated, because storage can hold anything.
export const MAX_CHATS = 40
export const MAX_STORED_MESSAGES = 300
const TITLE_LENGTH = 60

const messageSchema = z.object({
  id: z.number().int(),
  from: z.enum(['you', 'droplet', 'divider']),
  text: z.string().max(4000),
  // The question Droplet asked at the end of a reply. The answers it suggested are not kept: like buttons, they mean nothing later.
  question: z.string().max(400).optional(),
  // A table or a checklist shown under the words, with the ticks the founder made on it (by `block:item`).
  blocks: z.array(blockSchema).max(MAX_BLOCKS).optional(),
  checks: z.record(z.string().max(12), z.boolean()).optional(),
  // What a reply searched the web for and drew on, kept with it so the sources and Google's suggestions show whenever the reply does.
  grounding: groundingSchema.optional(),
  // What the reply changed on screen and what it left out, kept so the card shows again. The ability to undo it is not kept.
  receipt: receiptSchema.optional(),
  // A note from the app, not an answer from the model, so it is never sent to the model as part of the conversation.
  local: z.boolean().optional(),
  // When it was sent or arrived (ISO). Shown under the message on hover. Older chats have none.
  at: z.string().max(40).optional(),
})

export const chatSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(80),
  updatedAt: z.string(),
  messages: z.array(messageSchema).max(MAX_STORED_MESSAGES),
  // The title was chosen by the composer, rather than being the founder's first words.
  named: z.boolean().optional(),
  // Pinned by the founder: listed first, and kept when older chats make way.
  pinned: z.boolean().optional(),
  // A short memory of the chat, written in the background when it was left, so a later chat can look back at it. `summarisedAt` is when it was last
  // looked at (a chat that changed since is written down again), and `summaryEdited` says the founder wrote it, so it is not written over.
  summary: summarySchema.optional(),
  summarisedAt: z.string().optional(),
  summaryEdited: z.boolean().optional(),
})

export type StoredMessage = z.infer<typeof messageSchema>
export type StoredChat = z.infer<typeof chatSchema>

// What of a thread is worth keeping: the words, not the replies still being worked on, nor the buttons.
export function storableMessages(thread: { id: number; from: StoredMessage['from']; text: string; question?: string; blocks?: ChatBlock[]; checks?: Record<string, boolean>; grounding?: Grounding; receipt?: Receipt; pending?: boolean; local?: boolean; at?: string }[]): StoredMessage[] {
  return thread
    .filter((item) => !item.pending && item.text.trim() !== '')
    .map((item) => ({
      id: item.id,
      from: item.from,
      text: item.text.slice(0, 4000),
      ...(item.question ? { question: item.question.slice(0, 400) } : {}),
      ...(item.blocks && item.blocks.length > 0 ? { blocks: item.blocks } : {}),
      ...(item.checks && Object.keys(item.checks).length > 0 ? { checks: item.checks } : {}),
      ...(item.grounding ? { grounding: item.grounding } : {}),
      ...(item.receipt ? { receipt: item.receipt } : {}),
      ...(item.local ? { local: true } : {}),
      ...(item.at ? { at: item.at } : {}),
    }))
    .slice(-MAX_STORED_MESSAGES)
}

// A chat counts once the founder has said something in it.
export const hasFounderMessage = (messages: { from: string }[]) => messages.some((item) => item.from === 'you')

// A title from the composer, tidied: one line, no quotation marks or markup, no full stop at the end, and not too long. Empty if nothing is left.
export function cleanTitle(raw: string): string {
  const title = raw
    .replace(/\s+/g, ' ')
    .replace(/[*_`#<>]/g, '')
    .replace(/^["'“‘\s]+|["'”’\s]+$/g, '')
    .replace(/[.!?,:;\s]+$/, '')
    .trim()
  if (title === '') return ''
  return title.length > TITLE_LENGTH ? `${title.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : title
}

// What a chat is called in the list when the composer has not named it: how it began, on one line.
export function chatTitle(messages: { from: string; text: string }[]): string {
  const first = messages.find((item) => item.from === 'you')?.text.replace(/\s+/g, ' ').trim()
  if (!first) return 'New chat'
  return first.length > TITLE_LENGTH ? `${first.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : first
}

// The chat put in its place: replaced if it is there, otherwise added. Newest first, and only so many are kept.
export function upsertChat(chats: StoredChat[], chat: StoredChat): StoredChat[] {
  return byPinnedThenRecent([chat, ...chats.filter((other) => other.id !== chat.id)]).slice(0, MAX_CHATS)
}

// Pinned chats first, then the most recent.
export function byPinnedThenRecent<T extends { pinned?: boolean; updatedAt?: string }>(chats: T[]): T[] {
  return [...chats].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}

// A chat pinned or unpinned. Its place in time does not change.
export const pinChat = (chats: StoredChat[], id: string, pinned: boolean): StoredChat[] =>
  byPinnedThenRecent(
    chats.map((chat) => {
      if (chat.id !== id) return chat
      const { pinned: _was, ...rest } = chat
      return pinned ? { ...rest, pinned: true } : rest
    }),
  )

// When a chat last moved on: the time of the founder's newest message, or what was kept before if that is later (an older chat has no times
// on its messages). Opening a chat, ticking a box or a reply arriving does not move it; only something the founder sends does.
export function lastActive(messages: { from: string; at?: string }[], before?: string): string | undefined {
  const said = messages.reduce<string | undefined>((latest, item) => (item.from === 'you' && item.at && (!latest || item.at > latest) ? item.at : latest), undefined)
  if (!said) return before
  return before && before > said ? before : said
}

export const removeChat = (chats: StoredChat[], id: string): StoredChat[] => chats.filter((chat) => chat.id !== id)

export async function loadChats(projectId: string): Promise<StoredChat[]> {
  const raw = await documentStorage().read(projectId, 'chats')
  if (!Array.isArray(raw)) return []
  // One chat that cannot be read is left out, and the rest are kept.
  return raw.flatMap((entry) => {
    const chat = chatSchema.safeParse(entry)
    return chat.success ? [chat.data] : []
  })
}

// False when it could not be stored.
export function saveChats(projectId: string, chats: StoredChat[]): Promise<boolean> {
  return documentStorage().write(projectId, 'chats', chats.slice(0, MAX_CHATS))
}

export function clearChats(projectId: string): Promise<void> {
  return documentStorage().remove(projectId, 'chats')
}

// "Today, 14:05", "Yesterday, 09:30", or the day.
export function whenLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const time = date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86_400_000)
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })
}
