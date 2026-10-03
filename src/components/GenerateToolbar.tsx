import { AltArrowDownIcon, MagicWand3Icon } from '@solar-icons/react/linear'
import { HARMONIES, type Harmony } from '../lib/harmony.ts'
import { Toolbar } from './Toolbar.tsx'
import './GenerateToolbar.css'

type Props = {
  harmony: Harmony
  onHarmonyChange: (harmony: Harmony) => void
  onGenerate: () => void
  // False when every other colour is locked, so there is nothing to fill in.
  canGenerate: boolean
  // The colour it starts from, such as "Colour 2".
  from: string
  reason: string
  // 0 is the compact toolbar. 1 is the larger one, which shows every harmony and how many colours would change.
  size?: number
  // How many colours Generate would fill in, and how many it would leave as they are.
  fills: number
  keeps: number
}

// Fills in the colours that are not locked, working from the selected colour. The button says so when it cannot.
export default function GenerateToolbar({ harmony, onHarmonyChange, onGenerate, canGenerate, from, reason, size = 0, fills, keeps }: Props) {
  const large = size > 0
  return (
    <Toolbar title="Generate" reason={reason}>
      {large ? (
        <div className="generate__options" role="radiogroup" aria-label="Harmony">
          {HARMONIES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={harmony === option.id}
              className="generate__option"
              onClick={() => onHarmonyChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <label className="generate__select">
          <span className="visually-hidden">Harmony</span>
          <select value={harmony} onChange={(event) => onHarmonyChange(event.target.value as Harmony)}>
            {HARMONIES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <AltArrowDownIcon size={16} aria-hidden="true" />
        </label>
      )}
      <button type="button" className="generate__button" disabled={!canGenerate} onClick={onGenerate} aria-label={canGenerate ? `Generate colours from ${from}` : undefined}>
        <MagicWand3Icon size={16} aria-hidden="true" />
        {canGenerate ? 'Generate' : 'All locked'}
      </button>
      {large && (
        <span className="generate__count">
          Fills {fills}, keeps {keeps}
        </span>
      )}
    </Toolbar>
  )
}
