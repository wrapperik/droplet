import { summaryLines } from '../compose/background.ts'
import type { Task } from '../compose/taskNames.ts'
import type { StoredChat } from './chatStore.ts'

// Droplet looking back at earlier chats: which of them are worth a short memory, and which memories go with a message. Pure functions, so every rule can be tested. Words are matched, not meanings (for now).

const MIN_FOUNDER_CHARS = 20

// Whether a chat that was left is worth a memory: the founder said something in it (more than a bare hello), it changed since it was last written down,
// and the founder has not written the memory themselves.
export function needsSummary(chat: Pick<StoredChat, 'updatedAt' | 'summarisedAt' | 'summaryEdited'> | undefined, messages: { from: string; text: string }[]): boolean {
  if (!chat || chat.summaryEdited) return false
  const said = messages.filter((message) => message.from === 'you').reduce((total, message) => total + message.text.trim().length, 0)
  if (said < MIN_FOUNDER_CHARS) return false
  return chat.summarisedAt === undefined || chat.summarisedAt < chat.updatedAt
}

const STOP = new Set(['about', 'after', 'again', 'also', 'been', 'being', 'can', 'could', 'does', 'doing', 'done', 'from', 'have', 'help', 'into', 'just', 'like', 'make', 'more', 'need', 'please', 'should', 'some', 'that', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'what', 'when', 'where', 'which', 'with', 'would', 'your', 'want', 'would', 'tell', 'show', 'give'])

export const wordsOf = (text: string): Set<string> => new Set((text.toLowerCase().match(/[a-z0-9']{4,}/g) ?? []).filter((word) => !STOP.has(word)))

export const MAX_EARLIER_CHATS = 3
export const MAX_EARLIER_CHARS = 1200
const MAX_EARLIER_ENTRY = 400

export type EarlierChat = { when: string; text: string }

// The memories to send with a message: at most three, in 1,200 characters. A chat about the same task comes first, then ones that share words with the
// request, then the most recent. The chat the founder is in is left out, since it is already in the conversation.
export function selectEarlierChats(chats: StoredChat[], options: { currentChatId?: string; task?: Task; intent: string }): EarlierChat[] {
  const wanted = wordsOf(options.intent)
  const scored = chats
    .filter((chat) => chat.summary && chat.id !== options.currentChatId)
    .map((chat) => {
      const summary = chat.summary!
      const shared = [...wordsOf(`${chat.title} ${summaryLines(summary).join(' ')}`)].filter((word) => wanted.has(word)).length
      return { chat, summary, score: (options.task && summary.task === options.task ? 100 : 0) + shared }
    })
    .sort((a, b) => b.score - a.score || b.chat.updatedAt.localeCompare(a.chat.updatedAt))
  const picked: EarlierChat[] = []
  let used = 0
  for (const { chat, summary } of scored.slice(0, MAX_EARLIER_CHATS)) {
    const room = MAX_EARLIER_CHARS - used
    if (room < 40) break
    const text = summaryLines(summary).join('; ').slice(0, Math.min(MAX_EARLIER_ENTRY, room))
    picked.push({ when: chat.updatedAt.slice(0, 10), text })
    used += text.length
  }
  return picked
}
