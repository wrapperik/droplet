import { AltArrowDownIcon } from '@solar-icons/react/linear'
import { COLOUR_ROLES, type ColourRole } from '../lib/palette.ts'
import { Toolbar } from './Toolbar.tsx'
import './RoleToolbar.css'

type Props = {
  // The colour being edited, as a hex string, and its name such as "Colour 2".
  hex: string
  editing: string
  // The role it holds now, if the founder gave it one.
  role?: ColourRole
  onChange: (role: ColourRole | null) => void
}

// The tool: says what the selected colour is for. A role belongs to one colour, so choosing it here moves it from another.
// Dragged out of the toolbar it becomes the role window, which shows every role and who holds it.
export default function RoleToolbar({ hex, editing, role, onChange }: Props) {
  return (
    <Toolbar title="Role">
      <span className="role__dot" style={{ background: hex }} aria-hidden="true" />
      <label className="role__select">
        <span className="visually-hidden">{`Role for ${editing}`}</span>
        <select value={role ?? ''} onChange={(event) => onChange((event.target.value || null) as ColourRole | null)}>
          <option value="">No role</option>
          {COLOUR_ROLES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <AltArrowDownIcon size={16} aria-hidden="true" />
      </label>
    </Toolbar>
  )
}
