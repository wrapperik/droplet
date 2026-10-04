import { z } from 'zod'

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
  // A note from the app, not an answer from the model, so it is never sent to the model as part of the conversation.
  local: z.boolean().optional(),
})

export const chatSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(80),
  updatedAt: z.string(),
  messages: z.array(messageSchema).max(MAX_STORED_MESSAGES),
  // The title was chosen by the composer, rather than being the founder's first words.
  named: z.boolean().optional(),
})

export type StoredMessage = z.infer<typeof messageSchema>
export type StoredChat = z.infer<typeof chatSchema>

const keyFor = (projectId: string) => `droplet-project-${projectId}-chats`

// What of a thread is worth keeping: the words, not the replies still being worked on, nor the buttons.
export function storableMessages(thread: { id: number; from: StoredMessage['from']; text: string; question?: string; pending?: boolean; local?: boolean }[]): StoredMessage[] {
  return thread
    .filter((item) => !item.pending && item.text.trim() !== '')
    .map((item) => ({ id: item.id, from: item.from, text: item.text.slice(0, 4000), ...(item.question ? { question: item.question.slice(0, 400) } : {}), ...(item.local ? { local: true } : {}) }))
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
  return [chat, ...chats.filter((other) => other.id !== chat.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_CHATS)
}

export const removeChat = (chats: StoredChat[], id: string): StoredChat[] => chats.filter((chat) => chat.id !== id)

export function loadChats(projectId: string): StoredChat[] {
  try {
    const raw = window.localStorage.getItem(keyFor(projectId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // One chat that cannot be read is left out, and the rest are kept.
    return parsed.flatMap((entry) => {
      const chat = chatSchema.safeParse(entry)
      return chat.success ? [chat.data] : []
    })
  } catch {
    return []
  }
}

// Returns false when the browser refused to store it.
export function saveChats(projectId: string, chats: StoredChat[]): boolean {
  try {
    window.localStorage.setItem(keyFor(projectId), JSON.stringify(chats.slice(0, MAX_CHATS)))
    return true
  } catch {
    return false
  }
}

export function clearChats(projectId: string) {
  try {
    window.localStorage.removeItem(keyFor(projectId))
  } catch {
    // Nothing to clear.
  }
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
