import { CheckIcon } from '@solar-icons/react/linear'
import { readableTextColour } from '../lib/colour.ts'
import { COLOUR_ROLES, type ColourRole, type ResolvedRoles } from '../lib/palette.ts'
import './RoleCards.css'

type Props = {
  roles: ResolvedRoles
  // The colour being edited: its number in the palette and the role it holds now, if the founder gave it one.
  selected: { number: number; hex: string; role?: ColourRole }
  numberOf: (blockId: number) => number
  onChange: (role: ColourRole | null) => void
  onSelect: (blockId: number) => void
}

const WHAT_FOR: Record<ColourRole, string> = {
  primary: 'The main colour of the brand: buttons, headings and the largest areas.',
  accent: 'A second colour used sparingly, to draw the eye.',
  background: 'The colour behind everything, such as the page of a document.',
  text: 'The colour of body text. It has to read clearly on the background.',
}

// The roles: every role as a card, with the colour that holds it. Choosing a role for the selected colour
// moves it from the colour that held it. A role the founder did not choose is suggested from the colours, and says so.
export default function RoleCards({ roles, selected, numberOf, onChange, onSelect }: Props) {
  return (
    <>
      <ul className="roles">
        {COLOUR_ROLES.map((option) => {
          const held = roles[option.id]
          const holds = selected.role === option.id
          return (
            <li key={option.id} className="roles__card" data-held={holds || undefined}>
              <button
                type="button"
                className="roles__swatch"
                style={{ background: held.hex, color: readableTextColour(held.hex) }}
                aria-label={`${option.label} is colour ${numberOf(held.blockId)}, ${held.hex}. Select it.`}
                onClick={() => onSelect(held.blockId)}
              >
                {numberOf(held.blockId)}
              </button>
              <div className="roles__text">
                <p className="roles__name">
                  {option.label}
                  <span className="roles__hex">{held.hex}</span>
                </p>
                <p className="roles__note">{WHAT_FOR[option.id]}</p>
                <p className="roles__status">{held.chosen ? 'Chosen by you' : 'Suggested from the colours'}</p>
              </div>
              <button
                type="button"
                className="roles__use"
                aria-pressed={holds}
                onClick={() => onChange(holds ? null : option.id)}
              >
                {holds && <CheckIcon size={14} strokeWidth={2.5} aria-hidden="true" />}
                {holds ? `Colour ${selected.number}` : `Use colour ${selected.number}`}
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
