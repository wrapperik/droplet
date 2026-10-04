import { useCallback, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChatRoundAddIcon, ClockCircleIcon, FullScreenIcon, TrashBinMinimalisticIcon } from '@solar-icons/react/linear'
import { useDismiss } from '../hooks/useDismiss.ts'
import { whenLabel } from '../lib/chatStore.ts'
import './ChatBar.css'

// One conversation in the list.
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
  onNew: () => void
  onDelete: (id: string) => void
  // A workspace is open, so the conversation is in the side panel and can be made the whole screen again.
  onFullScreen?: () => void
  // Droplet is working on a reply, so the conversation cannot be changed under it.
  busy?: boolean
}

// The controls of a conversation: its history (which opens and closes), a new chat, and, with a workspace open, a way back to the
// conversation as the whole screen.
export default function ChatBar({ chats, onOpen, onNew, onDelete, onFullScreen, busy = false }: Props) {
  const [open, setOpen] = useState(false)
  const [forgetting, setForgetting] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const close = useCallback(() => {
    setOpen(false)
    setForgetting(null)
  }, [])
  useDismiss(open, close, wrapRef)

  return (
    <div className="chatbar" ref={wrapRef}>
      <button type="button" className="chatbar__button chatbar__button--history" aria-haspopup="dialog" aria-expanded={open} aria-controls={listId} onClick={() => (open ? close() : setOpen(true))}>
        <ClockCircleIcon size={18} aria-hidden="true" />
        <span>History</span>
      </button>

      <span className="chatbar__spacer" />

      <button type="button" className="chatbar__button" disabled={busy} aria-label="New chat" title="New chat" onClick={onNew}>
        <ChatRoundAddIcon size={18} aria-hidden="true" />
      </button>
      {onFullScreen && (
        <button type="button" className="chatbar__button" disabled={busy} aria-label="Back to the full chat" title="Back to the full chat" onClick={onFullScreen}>
          <FullScreenIcon size={18} aria-hidden="true" />
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            id={listId}
            className="chatbar__panel glass glass--strong"
            role="dialog"
            aria-label="Chat history"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {chats.length === 0 ? (
              <p className="chatbar__empty">Your conversations are kept here once you have said something.</p>
            ) : (
              <ul className="chatbar__list">
                {chats.map((chat) => (
                  <li key={chat.id} className="chatbar__item" data-current={chat.current || undefined}>
                    {forgetting === chat.id ? (
                      <span className="chatbar__ask">
                        <span>Delete this chat?</span>
                        <button type="button" className="chatbar__small chatbar__small--danger" onClick={() => { onDelete(chat.id); setForgetting(null) }}>
                          Delete
                        </button>
                        <button type="button" className="chatbar__small" onClick={() => setForgetting(null)}>
                          Keep
                        </button>
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="chatbar__open"
                          disabled={busy}
                          aria-current={chat.current ? 'true' : undefined}
                          onClick={() => {
                            if (!chat.current) onOpen(chat.id)
                            close()
                          }}
                        >
                          <span className="chatbar__title">{chat.title}</span>
                          <span className="chatbar__when">{chat.current ? 'Open now' : chat.updatedAt ? whenLabel(chat.updatedAt) : ''}</span>
                        </button>
                        <button type="button" className="chatbar__forget" disabled={busy} aria-label={`Delete ${chat.title}`} onClick={() => setForgetting(chat.id)}>
                          <TrashBinMinimalisticIcon size={16} aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
