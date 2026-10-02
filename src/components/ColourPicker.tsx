import { useId, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AltArrowDownIcon } from '@solar-icons/react/linear'
import { hexToRgb, hsvToRgb, normaliseHex, rgbToHex, rgbToHsv, type Hsv } from '../lib/colour.ts'
import './ColourPicker.css'

type Props = {
  // The colour being edited, as a hex string. The parent owns it.
  value: string
  onChange: (hex: string) => void
  // Which colour this is editing, for the heading, such as "Colour 2".
  editing?: string
  // One line saying why this component is on screen (manifesto principle 3).
  reason: string
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const hsvOf = (hex: string, keepHue: number): Hsv => {
  const next = rgbToHsv(hexToRgb(hex))
  // Greys and black have no hue of their own, so keep the hue the user already chose.
  return { h: next.s === 0 || next.v === 0 ? keepHue : next.h, s: next.s, v: next.v }
}

// Condensed by default, with a control to expand it for a larger area and exact channel values.
export default function ColourPicker({ value, onChange, editing, reason }: Props) {
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(hexToRgb(value)))
  const [syncedValue, setSyncedValue] = useState(value)
  const [draft, setDraft] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const id = useId()

  // When the parent switches to a different colour, load it. Edits made here are marked as synced first.
  if (value !== syncedValue) {
    setSyncedValue(value)
    setDraft(null)
    if (value !== rgbToHex(hsvToRgb(hsv))) setHsv(hsvOf(value, hsv.h))
  }

  const rgb = hsvToRgb(hsv)
  const hex = rgbToHex(rgb)
  const hexInvalid = draft !== null && normaliseHex(draft) === null

  const commit = (next: Hsv) => {
    const nextHex = rgbToHex(hsvToRgb(next))
    setDraft(null)
    setHsv(next)
    setSyncedValue(nextHex)
    onChange(nextHex)
  }

  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    commit({
      ...hsv,
      s: clamp01((event.clientX - box.left) / box.width),
      v: clamp01(1 - (event.clientY - box.top) / box.height),
    })
  }

  const onAreaKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    commit({ ...hsv, s: clamp01(hsv.s + move[0]), v: clamp01(hsv.v + move[1]) })
  }

  const onHexChange = (text: string) => {
    setDraft(text)
    const valid = normaliseHex(text)
    if (valid) {
      commit(hsvOf(valid, hsv.h))
      setDraft(text)
    }
  }

  const onChannelChange = (channel: 'r' | 'g' | 'b', text: string) => {
    const number = Math.min(255, Math.max(0, Math.round(Number(text) || 0)))
    commit(hsvOf(rgbToHex({ ...rgb, [channel]: number }), hsv.h))
  }

  return (
    <section className="picker glass glass--strong" aria-label="Colour picker" data-expanded={expanded}>
      <header className="picker__header">
        <div className="picker__heading">
          <h2 className="picker__title">Colour picker</h2>
          <p className="picker__reason">{reason}</p>
        </div>
        <button
          type="button"
          className="picker__toggle"
          aria-expanded={expanded}
          aria-controls={`${id}-more`}
          aria-label={expanded ? 'Show less' : 'Show more'}
          title={expanded ? 'Show less' : 'Show more'}
          onClick={() => setExpanded((open) => !open)}
        >
          <AltArrowDownIcon size={18} aria-hidden="true" />
        </button>
      </header>

      {editing && <p className="picker__editing">Editing {editing}</p>}

      <div
        className="picker__area"
        style={{ '--picker-hue': `${Math.round(hsv.h)}` } as CSSProperties}
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)} percent, brightness ${Math.round(hsv.v * 100)} percent`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          fromPointer(event)
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) fromPointer(event)
        }}
        onKeyDown={onAreaKeyDown}
      >
        <span
          className="picker__handle"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }}
        />
      </div>

      <input
        className="picker__hue"
        type="range"
        min={0}
        max={360}
        value={Math.round(hsv.h)}
        aria-label="Hue"
        onChange={(event) => commit({ ...hsv, h: Number(event.target.value) })}
      />

      <div className="picker__value">
        <span className="picker__swatch" style={{ background: hex }} aria-hidden="true" />
        <label className="picker__hex-label" htmlFor={`${id}-hex`}>
          Hex
        </label>
        <input
          id={`${id}-hex`}
          className="picker__hex"
          value={draft ?? hex}
          onChange={(event) => onHexChange(event.target.value)}
          onBlur={() => setDraft(null)}
          aria-invalid={hexInvalid}
          aria-describedby={hexInvalid ? `${id}-error` : undefined}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      {hexInvalid && (
        <p className="picker__error" id={`${id}-error`}>
          Use three or six hex digits, like #1F8FE0.
        </p>
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={`${id}-more`}
            className="picker__more"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="picker__channels">
              {(['r', 'g', 'b'] as const).map((channel) => (
                <label className="picker__channel" key={channel}>
                  <span>{channel.toUpperCase()}</span>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={Math.round(rgb[channel])}
                    onChange={(event) => onChannelChange(channel, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
