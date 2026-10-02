import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AltArrowDownIcon } from '@solar-icons/react/linear'
import { useDismiss } from '../hooks/useDismiss.ts'
import { hexToRgb, hsvToRgb, normaliseHex, rgbToHex, rgbToHsv, type Hsv } from '../lib/colour.ts'
import { Toolbar, ToolbarDivider } from './Toolbar.tsx'
import './ColourPicker.css'

type Props = {
  // The colour being edited, as a hex string. The parent owns it.
  value: string
  onChange: (hex: string) => void
  // Which colour this is editing, such as "Colour 2".
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

// A toolbar: the current colour and its hex value. Clicking the colour opens the full spectrum.
export default function ColourPicker({ value, onChange, editing = 'Colour', reason }: Props) {
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(hexToRgb(value)))
  const [syncedValue, setSyncedValue] = useState(value)
  const [draft, setDraft] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom')
  const wrapRef = useRef<HTMLDivElement>(null)
  const id = useId()
  useDismiss(open, () => setOpen(false), wrapRef)

  // When the parent switches to a different colour, load it. Edits made here are marked as synced first.
  if (value !== syncedValue) {
    setSyncedValue(value)
    setDraft(null)
    if (value !== rgbToHex(hsvToRgb(hsv))) setHsv(hsvOf(value, hsv.h))
  }

  const rgb = hsvToRgb(hsv)
  const hex = rgbToHex(rgb)
  const hexInvalid = draft !== null && normaliseHex(draft) === null

  // Open the spectrum upwards when it would run off the bottom of the window. The toolbar can move while the
  // spectrum is open (it is dragged, or the layout is reset, by a parent this component never re-renders for),
  // so the position is checked every frame while open, and the state only changes when the answer does.
  useLayoutEffect(() => {
    if (!open) return
    const choose = (): 'top' | 'bottom' => {
      const box = wrapRef.current?.getBoundingClientRect()
      if (!box) return 'bottom'
      const needed = 360
      const roomBelow = window.innerHeight - box.bottom - 96 // keep clear of the intent bar
      return roomBelow < needed && box.top > needed ? 'top' : 'bottom'
    }
    setPlacement(choose())
    let frame = 0
    const watch = () => {
      const next = choose()
      setPlacement((current) => (current === next ? current : next))
      frame = requestAnimationFrame(watch)
    }
    frame = requestAnimationFrame(watch)
    return () => cancelAnimationFrame(frame)
  }, [open])

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

  // While typing, only a complete six-digit value changes the colour. "#1F8" is a valid short form,
  // but it is usually the start of "#1F8FE0", so short forms are accepted when the field is left.
  const onHexChange = (text: string) => {
    if (/^#?[0-9a-f]{6}$/i.test(text.trim())) commit(hsvOf(normaliseHex(text)!, hsv.h))
    setDraft(text)
  }

  const finishHex = () => {
    const valid = draft === null ? null : normaliseHex(draft)
    if (valid) commit(hsvOf(valid, hsv.h))
    setDraft(null)
  }

  const onChannelChange = (channel: 'r' | 'g' | 'b', text: string) => {
    const number = Math.min(255, Math.max(0, Math.round(Number(text) || 0)))
    commit(hsvOf(rgbToHex({ ...rgb, [channel]: number }), hsv.h))
  }

  return (
    <div className="picker" ref={wrapRef}>
      <Toolbar title="Colour picker" reason={reason}>
        <button
          type="button"
          className="picker__swatch-button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={`${id}-spectrum`}
          aria-label={`${editing}, ${hex}. ${open ? 'Close' : 'Open'} the colour spectrum`}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="picker__swatch" style={{ background: hex }} aria-hidden="true" />
          <span className="picker__name">{editing}</span>
          <AltArrowDownIcon className="picker__chevron" size={16} aria-hidden="true" />
        </button>
        <ToolbarDivider />
        <label className="visually-hidden" htmlFor={`${id}-hex`}>
          Hex value
        </label>
        <input
          id={`${id}-hex`}
          className="picker__hex"
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
        {hexInvalid && (
          <span className="visually-hidden" id={`${id}-error`}>
            Use three or six hex digits, like #1F8FE0.
          </span>
        )}
      </Toolbar>

      <AnimatePresence>
        {open && (
          <motion.div
            id={`${id}-spectrum`}
            className="spectrum glass glass--strong"
            role="dialog"
            aria-label="Colour spectrum"
            data-placement={placement}
            initial={{ opacity: 0, scale: 0.94, y: placement === 'top' ? 8 : -8, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.96, y: placement === 'top' ? 6 : -6, transition: { duration: 0.15 } }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              className="spectrum__area"
              style={{ '--picker-hue': `${Math.round(hsv.h)}` } as CSSProperties}
              role="slider"
              tabIndex={0}
              aria-label="Saturation and brightness"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(hsv.s * 100)}
              aria-valuetext={`Saturation ${Math.round(hsv.s * 100)} percent, brightness ${Math.round(hsv.v * 100)} percent`}
              onPointerDown={(event) => {
                try {
                  event.currentTarget.setPointerCapture(event.pointerId)
                } catch {
                  // Capture keeps the drag going outside the area. It is optional.
                }
                fromPointer(event)
              }}
              onPointerMove={(event) => {
                if (event.buttons === 1) fromPointer(event)
              }}
              onKeyDown={onAreaKeyDown}
            >
              <span
                className="spectrum__handle"
                style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }}
              />
            </div>

            <input
              className="spectrum__hue"
              type="range"
              min={0}
              max={360}
              value={Math.round(hsv.h)}
              aria-label="Hue"
              onChange={(event) => commit({ ...hsv, h: Number(event.target.value) })}
            />

            <div className="spectrum__channels">
              {(['r', 'g', 'b'] as const).map((channel) => (
                <label className="spectrum__channel" key={channel}>
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
    </div>
  )
}
