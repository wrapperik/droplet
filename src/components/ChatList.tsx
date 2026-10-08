import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MenuDotsVerticalIcon, PinIcon, TrashBinMinimalisticIcon } from '@solar-icons/react/linear'
import { useDismiss } from '../hooks/useDismiss.ts'
import { whenLabel } from '../lib/chatStore.ts'
import './ChatList.css'

// One conversation in a list.
export type ChatEntry = {
  id: string
  title: string
  // When it last changed, as an ISO date. Missing for the one that is open now.
  updatedAt?: string
  current: boolean
  // Kept at the top of the list.
  pinned?: boolean
}

type Props = {
  chats: ChatEntry[]
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  // Pin a chat to the top of the list, or unpin it.
  onPin?: (id: string, pinned: boolean) => void
  // Droplet is working on a reply, so the conversation cannot be changed under it.
  busy?: boolean
  // Say when each chat last changed. The short list in the sidebar leaves it out to keep to one line each.
  showWhen?: boolean
  // The list sits on the dark shell (the sidebar), so its menu is drawn with the shell's tokens too.
  onShell?: boolean
}

// A list of conversations, each one to open, with a menu (three dots) to pin it or delete it. Deleting asks a second time. Used for the recent
// chats in the sidebar and for the full list that "See all chats" opens.
export default function ChatList({ chats, onOpen, onDelete, onPin, busy = false, showWhen = false, onShell = false }: Props) {
  const [forgetting, setForgetting] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const menuChat = menu ? chats.find((chat) => chat.id === menu.id) : undefined

  return (
    <>
      <ul className="chatlist">
        {chats.map((chat) => (
          <li key={chat.id} className="chatlist__item" data-current={chat.current || undefined} data-menu={menu?.id === chat.id || undefined}>
            {forgetting === chat.id ? (
              <span className="chatlist__ask">
                <span>Delete this chat?</span>
                <button
                  type="button"
                  className="chatlist__small chatlist__small--danger"
                  onClick={() => {
                    onDelete(chat.id)
                    setForgetting(null)
                  }}
                >
                  Delete
                </button>
                <button type="button" className="chatlist__small" onClick={() => setForgetting(null)}>
                  Keep
                </button>
              </span>
            ) : (
              <>
                <button type="button" className="chatlist__open" disabled={busy} aria-current={chat.current ? 'true' : undefined} onClick={() => onOpen(chat.id)}>
                  <span className="chatlist__title">
                    {chat.pinned && <PinIcon className="chatlist__pin" size={12} aria-label="Pinned" />}
                    <span className="chatlist__name">{chat.title}</span>
                  </span>
                  {showWhen && <span className="chatlist__when">{chat.current ? 'Open now' : chat.updatedAt ? whenLabel(chat.updatedAt) : ''}</span>}
                </button>
                <button
                  type="button"
                  className="chatlist__more"
                  disabled={busy}
                  aria-label={`More for ${chat.title}`}
                  aria-haspopup="menu"
                  aria-expanded={menu?.id === chat.id}
                  onClick={(event) => {
                    const anchor = event.currentTarget
                    setMenu((current) => (current?.id === chat.id ? null : { id: chat.id, anchor }))
                  }}
                >
                  <MenuDotsVerticalIcon size={16} aria-hidden="true" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {menu && menuChat && (
        <ChatMenu
          anchor={menu.anchor}
          onShell={onShell}
          pinned={Boolean(menuChat.pinned)}
          canPin={Boolean(onPin)}
          onClose={closeMenu}
          onPin={() => {
            onPin?.(menuChat.id, !menuChat.pinned)
            closeMenu()
          }}
          onDelete={() => {
            setForgetting(menuChat.id)
            closeMenu()
          }}
        />
      )}
    </>
  )
}

// The menu of one chat, drawn on the page (a portal) beside its button, so the list's scrolling cannot clip it. Escape, a press outside, a scroll
// or a resize closes it.
function ChatMenu({ anchor, onShell, pinned, canPin, onClose, onPin, onDelete }: { anchor: HTMLElement; onShell: boolean; pinned: boolean; canPin: boolean; onClose: () => void; onPin: () => void; onDelete: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null)
  useDismiss(true, onClose, ref)

  useLayoutEffect(() => {
    const box = anchor.getBoundingClientRect()
    const width = ref.current?.offsetWidth ?? 160
    const height = ref.current?.offsetHeight ?? 80
    const below = box.bottom + 4 + height <= window.innerHeight
    setPlace({ top: below ? box.bottom + 4 : Math.max(8, box.top - 4 - height), left: Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8)) })
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [anchor])

  useEffect(() => {
    const close = (event: Event) => {
      if (ref.current?.contains(event.target as Node)) return
      onClose()
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      data-layer=""
      className={onShell ? 'chatmenu glass on-shell' : 'chatmenu glass'}
      style={place ? { top: place.top, left: place.left } : { visibility: 'hidden' }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
        const at = items.indexOf(document.activeElement as HTMLButtonElement)
        items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
      }}
    >
      {canPin && (
        <button type="button" role="menuitem" className="chatmenu__item" onClick={onPin}>
          <PinIcon size={16} aria-hidden="true" />
          {pinned ? 'Unpin' : 'Pin'}
        </button>
      )}
      <button type="button" role="menuitem" className="chatmenu__item chatmenu__item--danger" onClick={onDelete}>
        <TrashBinMinimalisticIcon size={16} aria-hidden="true" />
        Delete
      </button>
    </div>,
    document.body,
  )
}
