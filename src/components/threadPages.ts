import type { ThreadMessage } from './ChatThread.tsx'

// Suggested replies under the newest message are off: Droplet asks its question in words and the founder answers in the box. The reply buttons, their styles, their
// tests and the `replies` field of a turn are kept, so setting this to true brings them back.
export const SHOW_SUGGESTED_REPLIES = false

// How many ticks either side of the exchange in view the rail shows.
export const RAIL_REACH = 9

export type Page = { key: number; label: string; messages: ThreadMessage[] }

// The thread cut into exchanges: each begins at a message from the founder and holds the replies, notes and cards that follow it, and a divider belongs to the
// exchange it introduces. Replies with no question before them (a greeting, a note from the app) are an exchange of their own.
export function exchangesOf(messages: ThreadMessage[]): Page[] {
  const pages: Page[] = []
  let carry: ThreadMessage[] = []
  for (const message of messages) {
    if (message.from === 'divider') {
      carry.push(message)
      continue
    }
    const current = pages[pages.length - 1]
    if (message.from === 'you' || !current) {
      pages.push({ key: message.id, label: '', messages: [...carry, message] })
      carry = []
    } else {
      current.messages.push(...carry, message)
      carry = []
    }
  }
  if (carry.length > 0 && pages.length > 0) pages[pages.length - 1].messages.push(...carry)
  return pages.map((page, at) => {
    const first = page.messages.find((message) => message.from !== 'divider')
    const words = (first?.text ?? '').replace(/\s+/g, ' ').trim()
    return { ...page, label: `exchange ${at + 1}: ${words.length > 50 ? `${words.slice(0, 49)}…` : words || 'no words'}` }
  })
}

