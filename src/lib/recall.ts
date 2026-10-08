import { summaryLines, type ChatSummary } from '../compose/background.ts'
import type { Task } from '../compose/taskNames.ts'
import type { FactKey } from './facts.ts'
import type { StoredChat } from './chatStore.ts'

// Droplet looking back at earlier chats: which of them are worth a short memory, which memories go with a message, and the line that greets a founder who
// comes back. Pure functions, so every rule can be tested. Words are matched, not meanings (for now).

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

// ---- Welcome back ----

export type WelcomeInput = {
  projectName: string
  facts: Partial<Record<FactKey, string>>
  summary: ChatSummary
  hasPalette: boolean
  invoices: number
  boardItems: number
}

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

// What a returning founder is greeted with, built in code from what was written down, and never by the model: where they left off, and what is saved. It
// is a message from the app, not Droplet's words, so it is never sent to the composer.
export function welcomeBack(input: WelcomeInput): { text: string; question: string; replies: string[] } {
  const name = (input.facts['business.name'] ?? input.projectName).trim() || 'your project'
  const done = input.summary.decided.slice(0, 2).map(lower)
  const left = input.summary.open.slice(0, 1).map(lower)
  const lastTime = done.length > 0 ? `Last time you ${done.join(' and ')}` : `Last time you were on ${lower(input.summary.subject)}`
  const state =
    input.summary.task === 'brand' && !input.hasPalette ? ', and the palette is not saved yet'
    : input.summary.task === 'invoice' && input.invoices === 0 ? ', and the invoice is not saved yet'
    : input.summary.task === 'ideation' && input.boardItems === 0 ? ', and nothing from the board is saved yet'
    : left.length > 0 ? `, and ${left[0]}`
    : ''
  const next = nextStep(input)
  return {
    text: `Welcome back to ${name}. ${lastTime}${state}.`,
    question: 'Shall we carry on?',
    replies: [...(next ? [`Carry on with ${next}`] : []), 'Something else'],
  }
}

// The step to offer, from what the memory was about and what is already in the project.
function nextStep(input: WelcomeInput): string | null {
  switch (input.summary.task) {
    case 'brand':
      return 'the colours'
    case 'invoice':
      return 'the invoice'
    case 'ideation':
      return 'the board'
    case 'logo':
      return 'the logo'
    default:
      return input.hasPalette ? null : 'the colours'
  }
}

