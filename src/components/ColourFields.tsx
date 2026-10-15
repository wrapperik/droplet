import { useId, useState } from 'react'
import { hexToRgb, normaliseHex, rgbToHex } from '../lib/colour.ts'
import { COLOUR_ROLES, type ColourRole } from '../lib/palette.ts'
import './ColourFields.css'

type FieldsProps = {
  // The colour being edited and its place in the palette (from 1), for the accessible names.
  hex: string
  number: number
  onChange: (hex: string) => void
}

// The exact value of one colour: its hex code, and red, green and blue. While typing, only a complete six-digit hex changes the colour (`#1F8` is valid short hex
// but is usually the start of `#1F8FE0`); the short form applies on Enter or when the field is left. A channel that is half a number is not applied.
export function ColourFields({ hex, number, onChange }: FieldsProps) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const [channelDraft, setChannelDraft] = useState<{ channel: 'r' | 'g' | 'b'; text: string } | null>(null)
  const rgb = hexToRgb(hex)

  const setChannel = (channel: 'r' | 'g' | 'b', text: string) => {
    setChannelDraft({ channel, text })
    if (!/^\d{1,3}$/.test(text.trim())) return
    const value = Number(text)
    if (value > 255) return
    onChange(rgbToHex({ ...rgb, [channel]: value }))
  }

  const onHexChange = (text: string) => {
    if (/^#?[0-9a-f]{6}$/i.test(text.trim())) {
      setDraft(null)
      onChange(normaliseHex(text)!)
    } else setDraft(text)
  }
  const finishHex = () => {
    const valid = draft === null ? null : normaliseHex(draft)
    if (valid) onChange(valid)
    setDraft(null)
  }
  const hexInvalid = draft !== null && normaliseHex(draft) === null

  return (
    <div className="cfields">
      <label className="cfields__field cfields__field--hex">
        <span>Hex</span>
        <input
          className="cfields__input"
          value={draft ?? hex}
          onChange={(event) => onHexChange(event.target.value)}
          onBlur={finishHex}
          onKeyDown={(event) => {
            if (event.key === 'Enter') finishHex()
          }}
          aria-invalid={hexInvalid}
          aria-describedby={hexInvalid ? `${id}-error` : undefined}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      {hexInvalid && (
        <span className="visually-hidden" id={`${id}-error`}>
          Use three or six hex digits, like #1F8FE0.
        </span>
      )}
      <div className="cfields__rgb" role="group" aria-label={`Red, green and blue of colour ${number}`}>
        {(['r', 'g', 'b'] as const).map((channel) => (
          <label key={channel} className="cfields__field cfields__field--channel">
            <span>{{ r: 'Red', g: 'Green', b: 'Blue' }[channel]}</span>
            <input
              className="cfields__input cfields__input--channel"
              inputMode="numeric"
              value={channelDraft?.channel === channel ? channelDraft.text : String(rgb[channel])}
              onChange={(event) => setChannel(channel, event.target.value)}
              onBlur={() => setChannelDraft(null)}
              autoComplete="off"
            />
          </label>
        ))}
      </div>
    </div>
  )
}

type RoleProps = {
  number: number
  // The role the founder gave this colour, if they did.
  role: ColourRole | undefined
  // The role the app would give it from the colours, if it holds one and the founder has not chosen.
  suggested: ColourRole | null
  onChange: (role: ColourRole | null) => void
}

// What the colour is for. A role belongs to one colour, so choosing it moves it from the colour that held it. A colour with none chosen says what the colours suggest.
export function RoleChoice({ number, role, suggested, onChange }: RoleProps) {
  const id = useId()
  const label = (value: ColourRole) => COLOUR_ROLES.find((entry) => entry.id === value)!.label
  return (
    <div className="cfields__role" data-part="roles">
      <label htmlFor={id}>Role of colour {number}</label>
      <select id={id} className="cfields__select" value={role ?? ''} onChange={(event) => onChange(event.target.value === '' ? null : (event.target.value as ColourRole))}>
        <option value="">None chosen</option>
        {COLOUR_ROLES.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>
      <p className="cfields__hint">{role ? `You chose ${label(role)}. Choosing it for another colour moves it.` : suggested ? `Suggested from the colours: ${label(suggested)}.` : 'No role yet. The preview and the brand sheet use the roles.'}</p>
    </div>
  )
}
