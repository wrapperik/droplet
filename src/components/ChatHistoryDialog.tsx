import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseCircleIcon, MagnifierIcon } from '@solar-icons/react/linear'
import { useDismiss } from '../hooks/useDismiss.ts'
import ChatList, { type ChatEntry } from './ChatList.tsx'
import './ChatHistoryDialog.css'

type Props = {
  open: boolean
  onClose: () => void
  chats: ChatEntry[]
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onPin?: (id: string, pinned: boolean) => void
  busy?: boolean
}

// Every conversation of the project, with a search, for when the few recent ones in the sidebar are not enough. A dialog over the page:
// Escape, the close button or a press outside closes it, and opening a chat closes it too.
export default function ChatHistoryDialog({ open, ...rest }: Props) {
  return open ? <Dialog {...rest} /> : null
}

// Mounted only while open, so the search starts empty each time.
function Dialog({ onClose, chats, onOpen, onDelete, onPin, busy }: Omit<Props, 'open'>) {
  const [query, setQuery] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  useDismiss(true, onClose, panelRef)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase()
    return words === '' ? chats : chats.filter((chat) => chat.title.toLowerCase().includes(words))
  }, [chats, query])

  return createPortal(
    <div className="chats-dialog__scrim">
      <div className="chats-dialog glass glass--strong" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef}>
        <header className="chats-dialog__header">
          <h2 className="chats-dialog__title" id={titleId}>
            All chats
          </h2>
          <button type="button" className="chats-dialog__close" aria-label="Close" onClick={onClose}>
            <CloseCircleIcon size={22} aria-hidden="true" />
          </button>
        </header>
        <label className="chats-dialog__search">
          <MagnifierIcon size={18} aria-hidden="true" />
          <input ref={searchRef} type="search" placeholder="Search chats" aria-label="Search chats" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
        </label>
        <div className="chats-dialog__body">
          {chats.length === 0 ? (
            <p className="chats-dialog__empty">Your conversations are kept here once you have said something.</p>
          ) : shown.length === 0 ? (
            <p className="chats-dialog__empty">No chats match “{query.trim()}”.</p>
          ) : (
            <ChatList
              chats={shown}
              showWhen
              busy={busy}
              onDelete={onDelete}
              onPin={onPin}
              onOpen={(id) => {
                onOpen(id)
                onClose()
              }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
