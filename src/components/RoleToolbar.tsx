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
  reason: string
}

// Says what the selected colour is for. A role belongs to one colour, so choosing it here moves it from another.
// Choosing the role it already has clears it.
export default function RoleToolbar({ hex, editing, role, onChange, reason }: Props) {
  return (
    <Toolbar title="Role" reason={reason}>
      <span className="role__dot" style={{ background: hex }} aria-hidden="true" />
      <div className="role__options" role="group" aria-label={`Role for ${editing}`}>
        {COLOUR_ROLES.map((option) => {
          const pressed = role === option.id
          return (
            <button
              key={option.id}
              type="button"
              className="role__option"
              aria-pressed={pressed}
              onClick={() => onChange(pressed ? null : option.id)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </Toolbar>
  )
}
