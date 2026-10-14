import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { StarsMinimalisticIcon } from '@solar-icons/react/linear'
import { LAYER_ATTRIBUTE } from '../hooks/useDismiss.ts'
import type { Suggestion } from '../lib/inlineAi.ts'
import { useAsk } from './AskContext.tsx'
import './AskDroplet.css'

type Props = {
  // What to offer for what is selected. Nothing, and nothing is drawn.
  suggestions: Suggestion[]
  // What the button is called to a screen reader, and what the field asks for: "Ask Droplet about this note".
  label: string
  // How the button looks: with its words (in the board's selection bar), or the icon alone (on a colour or a line).
  compact?: boolean
  style?: CSSProperties
}

// Droplet offered where the work is: a button beside the thing selected that opens a few suggestions for it and a small field to ask about it. Whatever
// is chosen or typed is sent as the founder's own message through the chat, so it comes back with a change receipt and Undo this. It does nothing by
// itself, and draws nothing where there is no chat to send to.
export default function AskDroplet({ suggestions, label, compact = false, style }: Props) {
  const asking = useAsk()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  const close = useCallback(() => {
    setOpen(false)
    setText('')
  }, [])

  const toggle = () => {
    if (open) return close()
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setAt({ x: rect.left, y: rect.bottom + 6 })
    setOpen(true)
  }

  // Escape, a press outside, a scroll or a resize closes it: it is drawn on the page and would otherwise be left behind.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
        buttonRef.current?.focus()
      }
    }
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    fieldRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open, close])

  if (!asking || suggestions.length === 0) return null

  const send = (words: string) => {
    const said = words.trim()
    if (said === '' || asking.busy) return
    asking.ask(said)
    close()
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    send(text)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={compact ? 'ask ask--compact' : 'ask'}
        style={style}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={toggle}
      >
        <StarsMinimalisticIcon size={compact ? 16 : 18} aria-hidden="true" />
        {!compact && <span>Ask Droplet</span>}
      </button>
      {open &&
        at &&
        createPortal(
          <div ref={panelRef} className="ask__panel glass glass--strong" role="dialog" aria-labelledby={titleId} {...{ [LAYER_ATTRIBUTE]: '' }} style={{ left: at.x, top: at.y }} onPointerDown={(event) => event.stopPropagation()}>
            <p className="ask__title" id={titleId}>
              {label}
            </p>
            <ul className="ask__list" role="list">
              {suggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <button type="button" className="ask__suggestion" disabled={asking.busy} onClick={() => send(suggestion.text)}>
                    {suggestion.label}
                  </button>
                </li>
              ))}
            </ul>
            <form className="ask__form" onSubmit={submit}>
              <input ref={fieldRef} className="ask__field" type="text" value={text} maxLength={600} placeholder="Ask about this" aria-label="Ask about this" autoComplete="off" onChange={(event) => setText(event.target.value)} />
              <button type="submit" className="ask__send" disabled={asking.busy || text.trim() === ''}>
                Ask
              </button>
            </form>
            {asking.busy && <p className="ask__wait">Droplet is working on a reply.</p>}
          </div>,
          document.body,
        )}
    </>
  )
}
