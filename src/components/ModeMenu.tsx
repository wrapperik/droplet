import { useEffect, useRef, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { BoltIcon, GlobalIcon } from '@solar-icons/react/linear'
import { describeAllowance } from '../lib/advancedAllowance.ts'
import type { Allowance, Mode } from '../compose/spec.ts'
import './ModeMenu.css'

type Props = {
  mode: Mode
  allowance: Allowance | null
  onSelect: (mode: Mode) => void
}

// Quick or Advanced, for the next message only. Quick is the default; Advanced is the founder's choice and is never switched on by the app. When no
// Advanced answers are left the row stays, disabled, and says when one comes back.
export default function ModeMenu({ mode, allowance, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const advanced = describeAllowance(allowance)

  useEffect(() => {
    listRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
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
      className="mode-menu glass glass--strong"
      role="menu"
      aria-label="How Droplet answers your next message"
      onKeyDown={onKeyDown}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <button type="button" role="menuitemradio" aria-checked={mode === 'base'} className="mode-menu__item" onClick={() => onSelect('base')}>
        <BoltIcon size={22} aria-hidden="true" />
        <span className="mode-menu__text">
          <span className="mode-menu__label">Quick</span>
          <span className="mode-menu__hint">Fast, from what it knows</span>
        </span>
      </button>
      {/* aria-disabled and not disabled, so it can still be reached and its reason read out */}
      <button
        type="button"
        role="menuitemradio"
        aria-checked={mode === 'advanced'}
        aria-disabled={advanced.exhausted || undefined}
        className="mode-menu__item"
        onClick={() => {
          if (!advanced.exhausted) onSelect('advanced')
        }}
      >
        <GlobalIcon size={22} aria-hidden="true" />
        <span className="mode-menu__text">
          <span className="mode-menu__label">Advanced</span>
          <span className="mode-menu__hint">{advanced.text}</span>
        </span>
      </button>
    </motion.div>
  )
}
