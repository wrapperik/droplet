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
import { colourSuggestions } from '../lib/inlineAi.ts'
import { COLOUR_ROLES, type PaletteBlock, type ResolvedRoles } from '../lib/palette.ts'
import AskDroplet from './AskDroplet.tsx'
import './SwatchStrip.css'

type Props = {
  blocks: PaletteBlock[]
  roles: ResolvedRoles
  selectedId: number
  max: number
  min: number
  onSelect: (id: number) => void
  onAdd: () => void
  onRemove: (id: number) => void
  onToggleLock: (id: number) => void
  // "Keep in mind": Droplet's notes on the project always include a starred colour.
  onToggleStar?: (id: number) => void
}

const roleLabel = (id: string) => COLOUR_ROLES.find((role) => role.id === id)?.label ?? id

// The palette as tall rounded pills in a row, the hex code under each and the role it holds in small text. Press one to select it: the one selected has a ring
// and a tick. Keep (when generating), keep in mind, ask Droplet, copy and remove appear on a pill while the pointer is on it or the keyboard is in it, and are
// always there on a touch screen. After the last pill, Add colour, up to the maximum. Nothing is boxed: the pills sit on the screen.
export default function SwatchStrip({ blocks, roles, selectedId, max, min, onSelect, onAdd, onRemove, onToggleLock, onToggleStar }: Props) {
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [removedNote, setRemovedNote] = useState('')
  const rowRef = useRef<HTMLFieldSetElement>(null)
  const refocus = useRef(false)
  const canRemove = blocks.length > min
  const full = blocks.length >= max

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

  // The remove button disappears with its pill, so keyboard focus moves to the colour now selected.
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    rowRef.current?.querySelector<HTMLInputElement>('.strip__input:checked')?.focus()
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
      // Clipboard access can be refused. The hex stays visible under the pill to copy by hand.
    }
  }

  return (
    <section className="strip" aria-label="Palette">
      <fieldset ref={rowRef} className="strip__row">
        <legend className="visually-hidden">Palette colours</legend>
        <AnimatePresence initial={false}>
          {blocks.map((block, index) => {
            const selected = block.id === selectedId
            const ink = readableTextColour(block.hex)
            const copied = copiedId === block.id
            // The role the founder gave it, else the one the colours suggest it would hold.
            const chosen = block.role
            const suggested = chosen ? undefined : COLOUR_ROLES.find((role) => roles[role.id].blockId === block.id && !roles[role.id].chosen)?.id
            return (
              <motion.div
                key={block.id}
                className="strip__cell"
                layout="position"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <div className="strip__pill-wrap">
                  <label className="strip__pill" data-block-id={block.id} style={{ background: block.hex, color: ink }} data-selected={selected}>
                    <input
                      className="strip__input"
                      type="radio"
                      name="palette-colour"
                      checked={selected}
                      onChange={() => onSelect(block.id)}
                      aria-label={`Colour ${index + 1}${block.name ? `, ${block.name}` : ''}, ${block.hex}${chosen ? `, ${roleLabel(chosen)}` : ''}`}
                    />
                    {selected && (
                      <span className="strip__tick" style={{ background: ink, color: block.hex }} aria-hidden="true">
                        <CheckIcon size={14} strokeWidth={2.5} />
                      </span>
                    )}
                  </label>
                  <div className="strip__actions" style={{ color: ink, '--block': block.hex } as CSSProperties}>
                    <button
                      type="button"
                      className="strip__action"
                      aria-pressed={Boolean(block.locked)}
                      aria-label={`Keep colour ${index + 1}, ${block.hex}, when generating`}
                      title="Keep when generating"
                      onClick={() => onToggleLock(block.id)}
                    >
                      {block.locked ? <LockKeyholeMinimalisticIcon size={15} aria-hidden="true" /> : <LockKeyholeMinimalisticUnlockedIcon size={15} aria-hidden="true" />}
                    </button>
                    {onToggleStar && (
                      <button
                        type="button"
                        className="strip__action"
                        aria-pressed={Boolean(block.starred)}
                        aria-label={`Keep colour ${index + 1}, ${block.hex}, in mind`}
                        title="Keep in mind"
                        onClick={() => onToggleStar(block.id)}
                      >
                        <StarIcon size={15} aria-hidden="true" />
                      </button>
                    )}
                    {selected && <AskDroplet compact className="strip__action" suggestions={colourSuggestions(index + 1)} label={`Ask Droplet about colour ${index + 1}`} style={{ color: ink }} />}
                    <button type="button" className="strip__action" onClick={() => copy(block)} aria-label={`Copy ${block.hex}`} title={copied ? 'Copied' : 'Copy the hex code'}>
                      {copied ? <CheckIcon size={14} strokeWidth={2.5} aria-hidden="true" /> : <CopyIcon size={14} aria-hidden="true" />}
                    </button>
                    {canRemove && (
                      <button type="button" className="strip__action" onClick={() => remove(block, index)} aria-label={`Remove colour ${index + 1}, ${block.hex}`} title="Remove the colour">
                        <TrashBinMinimalisticIcon size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="strip__caption">
                  <span className="strip__hex">{block.hex}</span>
                  {chosen && <span className="strip__role">{roleLabel(chosen)}</span>}
                  {suggested && (
                    <span className="strip__role strip__role--suggested">
                      {roleLabel(suggested)}
                      <span className="strip__suggested"> (suggested)</span>
                    </span>
                  )}
                </p>
              </motion.div>
            )
          })}
        </AnimatePresence>
        {!full && (
          <div className="strip__cell strip__cell--add">
            <button type="button" className="strip__add" onClick={onAdd} aria-label="Add colour" title="Add colour">
              <AddCircleIcon size={22} aria-hidden="true" />
            </button>
            <p className="strip__caption strip__caption--add">Add colour</p>
          </div>
        )}
      </fieldset>
      <p className="visually-hidden" role="status">
        {removedNote || (copiedId !== null ? 'Hex value copied.' : '')}
      </p>
    </section>
  )
}
