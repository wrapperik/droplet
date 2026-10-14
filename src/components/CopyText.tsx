import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckIcon, CopyIcon } from '@solar-icons/react/linear'
import './CopyText.css'

type Props = {
  // What is put on the clipboard.
  text: string
  // What is copied, for the button's name: "Copy {label}".
  label: string
  // Shown beside the icon. Without it the button is the icon alone.
  children?: ReactNode
}

// A button that copies words and says so. If the clipboard refuses, it says that instead, so a press is never silent.
export default function CopyText({ text, label, children }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState('idle'), 2200)
  }

  return (
    <>
      <button type="button" className="copy-text" data-has-label={children ? true : undefined} aria-label={`Copy ${label}`} onClick={() => void copy()}>
        {state === 'copied' ? <CheckIcon size={14} aria-hidden="true" /> : <CopyIcon size={14} aria-hidden="true" />}
        {children}
      </button>
      <span className="visually-hidden" role="status">
        {state === 'copied' ? `Copied ${label}.` : state === 'failed' ? `Could not copy ${label}. Select it and copy it yourself.` : ''}
      </span>
    </>
  )
}
