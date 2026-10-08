import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AddCircleIcon,
  CheckIcon,
  CopyIcon,
  LockKeyholeMinimalisticIcon,
  LockKeyholeMinimalisticUnlockedIcon,
  StarIcon,
  TrashBinMinimalisticIcon,
} from '@solar-icons/react/linear'
import { readableTextColour } from '../lib/colour.ts'
import { COLOUR_ROLES, type PaletteBlock } from '../lib/palette.ts'
import { ReasonTip } from './Toolbar.tsx'
import './PaletteCanvas.css'

type Props = {
  blocks: PaletteBlock[]
  selectedId: number
  max: number
  min: number
  onSelect: (id: number) => void
  onAdd: () => void
  onRemove: (id: number) => void
  onToggleLock: (id: number) => void
  // "Keep in mind": Droplet's notes on the project always include a starred colour.
  onToggleStar?: (id: number) => void
  // One line saying why this component is on screen (manifesto principle 3).
  reason: string
}

// The work area for a palette: colour blocks you click to select, then change with the picker.
export default function PaletteCanvas({ blocks, selectedId, max, min, onSelect, onAdd, onRemove, onToggleLock, onToggleStar, reason }: Props) {
  const full = blocks.length >= max
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [removedNote, setRemovedNote] = useState('')
  const gridRef = useRef<HTMLFieldSetElement>(null)
  const refocus = useRef(false)
  const canRemove = blocks.length > min

  useEffect(() => {
    if (copiedId === null) return
    const timer = window.setTimeout(() => setCopiedId(null), 1600)
    return () => window.clearTimeout(timer)
  }, [copiedId])

  useEffect(() => {
    if (!removedNote) return
    const timer = window.setTimeout(() => setRemovedNote(''), 3000)
    return () => window.clearTimeout(timer)
  }, [removedNote])

  // The remove button disappears with its block, so keyboard focus moves to the colour now selected.
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    gridRef.current?.querySelector<HTMLInputElement>('.palette__input:checked')?.focus()
  }, [blocks])

  const remove = (block: PaletteBlock, index: number) => {
    refocus.current = true
    setRemovedNote(`Colour ${index + 1}, ${block.hex}, removed.`)
    onRemove(block.id)
  }

  const copy = async (block: PaletteBlock) => {
    try {
      await navigator.clipboard.writeText(block.hex)
      setCopiedId(block.id)
    } catch {
      // Clipboard access can be refused. The hex stays visible on the block to copy by hand.
    }
  }

  return (
    <section className="palette" aria-label="Palette">
      <header className="palette__header">
        <div className="palette__heading">
          <h2 className="palette__title">Palette</h2>
          <ReasonTip reason={reason} />
        </div>
        <button type="button" className="palette__add" disabled={full} onClick={onAdd}>
          <AddCircleIcon size={18} aria-hidden="true" />
          {full ? 'Maximum reached' : 'Add colour'}
        </button>
      </header>

      <fieldset ref={gridRef} className="palette__grid">
        <legend className="visually-hidden">Palette colours</legend>
        <AnimatePresence initial={false}>
          {blocks.map((block, index) => {
            const selected = block.id === selectedId
            const ink = readableTextColour(block.hex)
            const copied = copiedId === block.id
            const roleLabel = COLOUR_ROLES.find((role) => role.id === block.role)?.label
            return (
              <motion.div
                key={block.id}
                className="palette__cell"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                whileTap={{ scale: 0.985 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <label
                  className="palette__block"
                  data-block-id={block.id}
                  style={{ background: block.hex, color: ink }}
                  data-selected={selected}
                >
                  <input
                    className="palette__input"
                    type="radio"
                    name="palette-colour"
                    checked={selected}
                    onChange={() => onSelect(block.id)}
                    aria-label={`Colour ${index + 1}${block.name ? `, ${block.name}` : ''}, ${block.hex}${roleLabel ? `, ${roleLabel}` : ''}`}
                  />
                  <span className="palette__top">
                    <span className="palette__titles">
                      <span className="palette__name">Colour {index + 1}</span>
                      {block.name && <span className="palette__given-name">{block.name}</span>}
                      {roleLabel && <span className="palette__role">{roleLabel}</span>}
                    </span>
                    {selected && (
                      <span className="palette__check" style={{ background: ink, color: block.hex }} aria-hidden="true">
                        <CheckIcon size={13} strokeWidth={2.5} />
                      </span>
                    )}
                  </span>
                  <span className="palette__hex">{block.hex}</span>
                </label>
                <div className="palette__actions">
                  <button
                    type="button"
                    className="palette__action"
                    style={{ color: ink, '--block': block.hex } as CSSProperties}
                    aria-pressed={Boolean(block.locked)}
                    aria-label={`Keep colour ${index + 1}, ${block.hex}, when generating`}
                    onClick={() => onToggleLock(block.id)}
                  >
                    {block.locked ? (
                      <LockKeyholeMinimalisticIcon size={15} aria-hidden="true" />
                    ) : (
                      <LockKeyholeMinimalisticUnlockedIcon size={15} aria-hidden="true" />
                    )}
                  </button>
                  {onToggleStar && (
                    <button
                      type="button"
                      className="palette__action"
                      style={{ color: ink, '--block': block.hex } as CSSProperties}
                      aria-pressed={Boolean(block.starred)}
                      aria-label={`Keep colour ${index + 1}, ${block.hex}, in mind`}
                      onClick={() => onToggleStar(block.id)}
                    >
                      <StarIcon size={15} aria-hidden="true" />
                    </button>
                  )}
                  {canRemove && (
                    <button
                      type="button"
                      className="palette__action"
                      style={{ color: ink }}
                      onClick={() => remove(block, index)}
                      aria-label={`Remove colour ${index + 1}, ${block.hex}`}
                    >
                      <TrashBinMinimalisticIcon size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="palette__copy"
                  style={{ color: ink }}
                  onClick={() => copy(block)}
                  aria-label={`Copy ${block.hex}`}
                >
                  {copied ? <CheckIcon size={14} strokeWidth={2.5} aria-hidden="true" /> : <CopyIcon size={14} aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </fieldset>
      <p className="visually-hidden" role="status">
        {copiedId !== null ? 'Hex value copied.' : removedNote}
      </p>
    </section>
  )
}
