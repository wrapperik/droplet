import { useEffect, useRef, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { FileTextIcon, GalleryIcon, DocumentIcon } from '@solar-icons/react/linear'
import type { AttachmentKind } from '../compose/attachments.ts'
import './AttachMenu.css'

type Props = {
  onChoose: (kind: AttachmentKind) => void
}

const ITEMS: { kind: AttachmentKind; label: string; hint: string; Icon: typeof GalleryIcon }[] = [
  { kind: 'image', label: 'Photo or screenshot', hint: 'PNG, JPG, WebP or GIF', Icon: GalleryIcon },
  { kind: 'pdf', label: 'PDF', hint: 'Up to 4 MB', Icon: DocumentIcon },
  { kind: 'text', label: 'Text file', hint: 'txt, md, csv or json', Icon: FileTextIcon },
]

// What the plus in the message bar opens: the kinds of file Droplet can read, each of which opens the picker for that kind. It says plainly that the
// whole file is sent to the AI to read, for that message only, so nothing private goes by accident.
export default function AttachMenu({ onChoose }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1
    items[(next + items.length) % items.length]?.focus()
  }

  return (
    <motion.div
      ref={listRef}
      className="attach-menu glass glass--strong"
      role="menu"
      aria-label="Attach a file"
      onKeyDown={onKeyDown}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="attach-menu__items">
        {ITEMS.map(({ kind, label, hint, Icon }) => (
          <button key={kind} type="button" role="menuitem" className="attach-menu__item" onClick={() => onChoose(kind)}>
            <Icon size={20} aria-hidden="true" />
            <span className="attach-menu__text">
              <span className="attach-menu__label">{label}</span>
              <span className="attach-menu__hint">{hint}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="attach-menu__note">The whole file is sent to Droplet’s AI to read, for that message only, and is not kept. Leave out anything private.</p>
    </motion.div>
  )
}
