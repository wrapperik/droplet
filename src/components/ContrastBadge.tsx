import { CheckIcon, CloseIcon } from '@solar-icons/react/linear'
import type { ContrastLevel } from '../lib/colour.ts'
import './ContrastBadge.css'

type Props = {
  ratio: number
  level: ContrastLevel
  // Hides the words and keeps the icon and number, for tight spaces. The words stay available to screen readers.
  compact?: boolean
}

// A contrast result as a number, a word and a circled icon, never colour alone.
export default function ContrastBadge({ ratio, level, compact = false }: Props) {
  const passes = level !== 'fail'
  const words = passes ? `Passes ${level}` : 'Fails AA'
  return (
    <span className="badge">
      <span className="badge__ratio">{ratio.toFixed(1)}:1</span>
      <span className={compact ? 'visually-hidden' : 'badge__words'}>{words}</span>
      <span className={`badge__dot badge__dot--${passes ? 'pass' : 'fail'}`} aria-hidden="true">
        {passes ? <CheckIcon size={11} strokeWidth={2.5} /> : <CloseIcon size={11} strokeWidth={2.5} />}
      </span>
    </span>
  )
}
