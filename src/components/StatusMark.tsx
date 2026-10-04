import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, MinusIcon } from '@solar-icons/react/linear'
import type { AssetStatus } from '../lib/mockProjects.ts'
import './StatusMark.css'

// What each status means, said in a few words. Shown as a tooltip from the icon, and read out in place of it.
const STATUS_MEANING: Record<AssetStatus, { word: string; meaning: string }> = {
  resolved: { word: 'Resolved', meaning: 'This asset is finished and ready to use.' },
  outstanding: { word: 'Outstanding', meaning: 'This asset is still to do.' },
}

// How far to the right of the icon the tooltip starts, in pixels.
const GAP_PX = 12

// Status is never shown by colour alone: the icon has a shape of its own (a tick, a dash), and the word is there for a screen
// reader and in the tooltip, which shows on hover, and on focus of the control the mark sits in. A resolved asset is green, and an
// outstanding one a quiet grey, since orange reads as a warning and an asset still to do is not one.
//
// The tooltip is drawn on the page itself, not inside the sidebar, whose list scrolls and so would clip it. It sits to the right of the
// icon, over the canvas, above everything else.
export default function StatusMark({ status }: { status: AssetStatus }) {
  const resolved = status === 'resolved'
  const StatusIcon = resolved ? CheckIcon : MinusIcon
  const { word, meaning } = STATUS_MEANING[status]
  const ref = useRef<HTMLSpanElement>(null)
  // Where the tooltip is, while it is shown: the middle of the icon's right edge.
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)

  const show = () => {
    const rect = ref.current?.getBoundingClientRect()
    if (rect) setAt({ x: rect.right + GAP_PX, y: rect.top + rect.height / 2 })
  }
  const hide = () => setAt(null)

  // The mark sits inside a button, which is what the keyboard reaches: the tooltip shows when the button has focus the way a keyboard
  // gives it (and not when it was only clicked).
  useEffect(() => {
    const button = ref.current?.closest('button')
    if (!button) return
    const onFocus = () => button.matches(':focus-visible') && show()
    button.addEventListener('focus', onFocus)
    button.addEventListener('blur', hide)
    return () => {
      button.removeEventListener('focus', onFocus)
      button.removeEventListener('blur', hide)
    }
  }, [])

  // A list that scrolls, or a window that changes size, moves the icon from under the tooltip, so it goes.
  useEffect(() => {
    if (!at) return
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && hide()
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [at])

  return (
    <span ref={ref} className={`status status--icon status--${status}`} onMouseEnter={show} onMouseLeave={hide}>
      {/* The comma keeps it apart from a label beside it when the two are read as one name. */}
      <span className="visually-hidden">, {word}</span>
      <span className="status__dot" aria-hidden="true">
        <StatusIcon size={12} strokeWidth={2.25} />
      </span>
      {at &&
        createPortal(
          <span className="status__tip glass glass--strong" aria-hidden="true" style={{ left: at.x, top: at.y }}>
            <strong>{word}</strong>
            {meaning}
          </span>,
          document.body,
        )}
    </span>
  )
}
