import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AddCircleIcon, CheckIcon, CopyIcon } from '@solar-icons/react/linear'
import { readableTextColour } from '../lib/colour.ts'
import './PaletteCanvas.css'

export type PaletteBlock = { id: number; hex: string }

type Props = {
  blocks: PaletteBlock[]
  selectedId: number
  max: number
  onSelect: (id: number) => void
  onAdd: () => void
}

// The work area for a palette: colour blocks you click to select, then change with the picker.
export default function PaletteCanvas({ blocks, selectedId, max, onSelect, onAdd }: Props) {
  const full = blocks.length >= max
  const [copiedId, setCopiedId] = useState<number | null>(null)

  useEffect(() => {
    if (copiedId === null) return
    const timer = window.setTimeout(() => setCopiedId(null), 1600)
    return () => window.clearTimeout(timer)
  }, [copiedId])

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
          <p className="palette__hint">
            {blocks.length} of {max} colours. Select one to edit it.
          </p>
        </div>
        <button type="button" className="palette__add" disabled={full} onClick={onAdd}>
          <AddCircleIcon size={18} aria-hidden="true" />
          {full ? 'Maximum reached' : 'Add colour'}
        </button>
      </header>

      <fieldset className="palette__grid">
        <legend className="visually-hidden">Palette colours</legend>
        <AnimatePresence initial={false}>
          {blocks.map((block, index) => {
            const selected = block.id === selectedId
            const ink = readableTextColour(block.hex)
            const copied = copiedId === block.id
            return (
              <motion.div
                key={block.id}
                className="palette__cell"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                whileTap={{ scale: 0.985 }}
                transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <label
                  className="palette__block"
                  style={{ background: block.hex, color: ink }}
                  data-selected={selected}
                >
                  <input
                    className="palette__input"
                    type="radio"
                    name="palette-colour"
                    checked={selected}
                    onChange={() => onSelect(block.id)}
                    aria-label={`Colour ${index + 1}, ${block.hex}`}
                  />
                  <span className="palette__name">Colour {index + 1}</span>
                  {selected && (
                    <span className="palette__check" style={{ background: ink, color: block.hex }} aria-hidden="true">
                      <CheckIcon size={13} strokeWidth={2.5} />
                    </span>
                  )}
                  <span className="palette__hex">{block.hex}</span>
                </label>
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
        {copiedId !== null ? 'Hex value copied.' : ''}
      </p>
    </section>
  )
}
