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
}

// The tool: fills in the colours that are not locked, working from the selected colour. The button says so when it cannot.
// Dragged out of the toolbar it becomes the harmony window, which previews each harmony.
export default function GenerateToolbar({ harmony, onHarmonyChange, onGenerate, canGenerate, from }: Props) {
  return (
    <Toolbar title="Generate">
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
      <button type="button" className="generate__button" disabled={!canGenerate} onClick={onGenerate} aria-label={canGenerate ? `Generate colours from ${from}` : undefined}>
        <MagicWand3Icon size={16} aria-hidden="true" />
        {canGenerate ? 'Generate' : 'All locked'}
      </button>
    </Toolbar>
  )
}
