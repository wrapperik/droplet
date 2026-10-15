import { MagicWand3Icon } from '@solar-icons/react/linear'
import { HARMONIES, HARMONY_NOTES, generatePalette, type Harmony } from '../lib/harmony.ts'
import type { PaletteBlock } from '../lib/palette.ts'
import './HarmonyCards.css'

type Props = {
  blocks: PaletteBlock[]
  selectedId: number
  harmony: Harmony
  // How many times Generate has been used, which decides which arrangement of the tones it gives next.
  variation: number
  canGenerate: boolean
  onHarmonyChange: (harmony: Harmony) => void
  onGenerate: () => void
}

// The harmony choice and the Generate button: each harmony as a card with a preview of the palette it would make from the selected
// colour, so the choice is seen before it is made. Colours that are kept stay as they are, in every preview.
export default function HarmonyCards({ blocks, selectedId, harmony, variation, canGenerate, onHarmonyChange, onGenerate }: Props) {
  return (
    <>
      <div className="harmonies" role="radiogroup" aria-label="Harmony">
        {HARMONIES.map((option) => {
          const preview = generatePalette(blocks, selectedId, option.id, variation)
          const chosen = harmony === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={chosen}
              className="harmonies__card"
              onClick={() => onHarmonyChange(option.id)}
            >
              <span className="harmonies__strip" aria-hidden="true">
                {preview.map((block) => (
                  <span key={block.id} style={{ background: block.hex }} />
                ))}
              </span>
              <span className="harmonies__name">{option.label}</span>
              <span className="harmonies__note">{HARMONY_NOTES[option.id]}</span>
            </button>
          )
        })}
      </div>
      <button type="button" className="harmonies__generate" disabled={!canGenerate} onClick={onGenerate}>
        <MagicWand3Icon size={18} aria-hidden="true" />
        {canGenerate ? 'Generate' : 'All locked'}
      </button>
    </>
  )
}
