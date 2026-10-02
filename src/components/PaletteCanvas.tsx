import { AnimatePresence, motion } from 'framer-motion'
import { AddCircleIcon, CheckIcon } from '@solar-icons/react/linear'
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

  return (
    <section className="palette" aria-label="Palette">
      <header className="palette__header">
        <div>
          <h2 className="palette__title">Palette</h2>
          <p className="palette__hint">
            {blocks.length} of {max} colours. Select a block, then change it with the colour picker.
          </p>
        </div>
        <button type="button" className="palette__add" disabled={full} onClick={onAdd}>
          <AddCircleIcon size={20} aria-hidden="true" />
          {full ? 'Maximum reached' : 'Add colour'}
        </button>
      </header>

      <fieldset className="palette__grid">
        <legend className="visually-hidden">Palette colours</legend>
        <AnimatePresence initial={false}>
          {blocks.map((block, index) => {
            const selected = block.id === selectedId
            const ink = readableTextColour(block.hex)
            return (
              <motion.label
                key={block.id}
                className="palette__block"
                style={{ background: block.hex, color: ink }}
                data-selected={selected}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
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
                    <CheckIcon size={14} strokeWidth={2.5} />
                  </span>
                )}
                <span className="palette__hex">{block.hex}</span>
              </motion.label>
            )
          })}
        </AnimatePresence>
      </fieldset>
    </section>
  )
}
