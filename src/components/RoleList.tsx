import { AltArrowDownIcon } from '@solar-icons/react/linear'
import { COLOUR_ROLES, type ColourRole, type PaletteBlock, type ResolvedRoles } from '../lib/palette.ts'
import { readableTextColour } from '../lib/colour.ts'
import './RoleList.css'

type Props = {
  blocks: PaletteBlock[]
  roles: ResolvedRoles
  onChange: (id: number, role: ColourRole | null) => void
  // Whether to list who holds each role now under the rows. The workspace leaves it out; the rows already say it.
  held?: boolean
}

// Guide mode's Roles step: a compact list, a line for each colour of the palette with a choice of what it is for, and under it the four roles and who holds them
// now. A role belongs to one colour, so choosing it moves it. A role nobody chose is suggested from the colours, and says so.
export default function RoleList({ blocks, roles, onChange, held = true }: Props) {
  return (
    <div className="roles">
      <ul className="roles__list">
        {blocks.map((block, index) => (
          <li key={block.id} className="roles__row">
            <span className="roles__swatch" style={{ background: block.hex, color: readableTextColour(block.hex) }} aria-hidden="true">
              {index + 1}
            </span>
            <span className="roles__hex">{block.hex}</span>
            <label className="roles__choice">
              <span className="visually-hidden">{`Role of colour ${index + 1}, ${block.hex}`}</span>
              <select className="roles__select" value={block.role ?? ''} onChange={(event) => onChange(block.id, event.target.value === '' ? null : (event.target.value as ColourRole))}>
                <option value="">None chosen</option>
                {COLOUR_ROLES.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.label}
                  </option>
                ))}
              </select>
              <AltArrowDownIcon className="roles__chevron" size={14} aria-hidden="true" />
            </label>
          </li>
        ))}
      </ul>
      {held && <h3 className="roles__held-title">The roles now</h3>}
      {held && <dl className="roles__held">
        {COLOUR_ROLES.map((role) => {
          const held = roles[role.id]
          return (
            <div key={role.id} className="roles__held-row">
              <dt>{role.label}</dt>
              <dd>
                <span className="roles__dot" style={{ background: held.hex }} aria-hidden="true" />
                {held.hex}
                <span className="roles__how">{held.chosen ? 'chosen by you' : 'suggested from the colours'}</span>
              </dd>
            </div>
          )
        })}
      </dl>}
    </div>
  )
}
