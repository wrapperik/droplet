import type { Icon } from '@solar-icons/react/lib/types'
import {
  BillListIcon,
  LetterIcon,
  LightbulbBoltIcon,
  PaletteIcon,
  PenNewSquareIcon,
} from '@solar-icons/react/linear'

export type TaskId = 'ideation' | 'brand' | 'logo' | 'invoice' | 'correspondence'

export type Task = {
  id: TaskId
  label: string
  hint: string
  icon: Icon
}

// The familiar path: the five tasks, in the order a founder meets them.
export const tasks: Task[] = [
  { id: 'ideation', label: 'Shape the business idea', hint: 'Compare offers and shortlist names', icon: LightbulbBoltIcon },
  { id: 'brand', label: 'Build the brand', hint: 'Palette and type, checked for contrast', icon: PaletteIcon },
  { id: 'logo', label: 'Get a logo', hint: 'What to brief, and where to go', icon: PenNewSquareIcon },
  { id: 'invoice', label: 'Make an invoice', hint: 'Line items, totals and your brand', icon: BillListIcon },
  { id: 'correspondence', label: 'Write to a client', hint: 'A firmer and a softer draft', icon: LetterIcon },
]
