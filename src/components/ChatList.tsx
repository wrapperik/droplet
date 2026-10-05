import { useState } from 'react'
import { TrashBinMinimalisticIcon } from '@solar-icons/react/linear'
import { whenLabel } from '../lib/chatStore.ts'
import './ChatList.css'

// One conversation in a list.
export type ChatEntry = {
  id: string
  title: string
  // When it last changed, as an ISO date. Missing for the one that is open now.
  updatedAt?: string
  current: boolean
}

type Props = {
  chats: ChatEntry[]
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  // Droplet is working on a reply, so the conversation cannot be changed under it.
  busy?: boolean
  // Say when each chat last changed. The short list in the sidebar leaves it out to keep to one line each.
  showWhen?: boolean
}

// A list of conversations, each one to open, and a delete behind a second press. Used for the recent chats in the sidebar and for the full
// list that "See all chats" opens.
export default function ChatList({ chats, onOpen, onDelete, busy = false, showWhen = false }: Props) {
  const [forgetting, setForgetting] = useState<string | null>(null)
  return (
    <ul className="chatlist">
      {chats.map((chat) => (
        <li key={chat.id} className="chatlist__item" data-current={chat.current || undefined}>
          {forgetting === chat.id ? (
            <span className="chatlist__ask">
              <span>Delete this chat?</span>
              <button type="button" className="chatlist__small chatlist__small--danger" onClick={() => { onDelete(chat.id); setForgetting(null) }}>
                Delete
              </button>
              <button type="button" className="chatlist__small" onClick={() => setForgetting(null)}>
                Keep
              </button>
            </span>
          ) : (
            <>
              <button type="button" className="chatlist__open" disabled={busy} aria-current={chat.current ? 'true' : undefined} onClick={() => onOpen(chat.id)}>
                <span className="chatlist__title">{chat.title}</span>
                {showWhen && <span className="chatlist__when">{chat.current ? 'Open now' : chat.updatedAt ? whenLabel(chat.updatedAt) : ''}</span>}
              </button>
              <button type="button" className="chatlist__forget" disabled={busy} aria-label={`Delete ${chat.title}`} onClick={() => setForgetting(chat.id)}>
                <TrashBinMinimalisticIcon size={16} aria-hidden="true" />
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}
