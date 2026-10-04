import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { hexToRgb, hsvToRgb, normaliseHex, readableTextColour, rgbToHex, rgbToHsv, type Hsv } from '../lib/colour.ts'
import ToolWindow from './ToolWindow.tsx'
import './ColourWheelWindow.css'

type Block = { id: number; hex: string }

type Props = {
  blocks: Block[]
  selectedId: number
  onSelect: (id: number) => void
  // Changes one colour. The wheel works on whichever colour the pointer picked up, which may not be the selected one yet.
  onChange: (id: number, hex: string) => void
  reason: string
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const hsvOf = (hex: string): Hsv => rgbToHsv(hexToRgb(hex))
// How close, in pixels, a press must be to a colour's marker to pick that marker up.
const PICK_RADIUS_PX = 16

// The colour picker as a window: a colour wheel with every colour in the palette on it. Drag a colour to change its hue
// and saturation. Brightness is the slider beneath, and every value also has a slider or a field, so nothing needs the
// pointer.
export default function ColourWheelWindow({ blocks, selectedId, onSelect, onChange, reason }: Props) {
  const wheelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<number | null>(null)
  const id = useId()
  const selected = blocks.find((block) => block.id === selectedId) ?? blocks[0]
  const hsv = hsvOf(selected.hex)
  const [draft, setDraft] = useState<string | null>(null)

  const commit = (blockId: number, next: Hsv) => {
    setDraft(null)
    onChange(blockId, rgbToHex(hsvToRgb(next)))
  }

  // A point on the wheel: the hue is the angle and the saturation is the distance from the centre.
  const wheelPoint = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const radius = box.width / 2
    const dx = event.clientX - (box.left + radius)
    const dy = event.clientY - (box.top + radius)
    const hue = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
    return { h: hue, s: clamp01(Math.hypot(dx, dy) / radius), box, radius }
  }

  const markerAt = (x: number, y: number, box: DOMRect) => {
    const radius = box.width / 2
    let nearest: { id: number; distance: number } | null = null
    for (const block of blocks) {
      const { h, s } = hsvOf(block.hex)
      const angle = (h * Math.PI) / 180
      const mx = box.left + radius + Math.sin(angle) * s * radius
      const my = box.top + radius - Math.cos(angle) * s * radius
      const distance = Math.hypot(x - mx, y - my)
      if (distance <= PICK_RADIUS_PX && (!nearest || distance < nearest.distance)) nearest = { id: block.id, distance }
    }
    return nearest?.id ?? null
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = wheelPoint(event)
    const picked = markerAt(event.clientX, event.clientY, point.box)
    dragRef.current = picked ?? selected.id
    if (picked !== null) {
      onSelect(picked)
      return
    }
    const base = hsvOf(selected.hex)
    commit(selected.id, { h: point.h, s: point.s, v: base.v })
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const blockId = dragRef.current
    if (blockId === null) return
    const block = blocks.find((candidate) => candidate.id === blockId)
    if (!block) return
    const point = wheelPoint(event)
    commit(blockId, { h: point.h, s: point.s, v: hsvOf(block.hex).v })
  }

  const finish = () => {
    dragRef.current = null
  }

  const onWheelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The arrow keys nudge the selected colour: left and right turn the hue, up and down change the saturation.
    const step = event.shiftKey ? 10 : 2
    if (event.key === 'ArrowLeft') commit(selected.id, { ...hsv, h: (hsv.h - step + 360) % 360 })
    else if (event.key === 'ArrowRight') commit(selected.id, { ...hsv, h: (hsv.h + step) % 360 })
    else if (event.key === 'ArrowUp') commit(selected.id, { ...hsv, s: clamp01(hsv.s + step / 100) })
    else if (event.key === 'ArrowDown') commit(selected.id, { ...hsv, s: clamp01(hsv.s - step / 100) })
    else return
    event.preventDefault()
  }

  const onHexChange = (text: string) => {
    if (/^#?[0-9a-f]{6}$/i.test(text.trim())) {
      setDraft(null)
      onChange(selected.id, normaliseHex(text)!)
    } else setDraft(text)
  }
  const finishHex = () => {
    const valid = draft === null ? null : normaliseHex(draft)
    if (valid) onChange(selected.id, valid)
    setDraft(null)
  }
  const hexInvalid = draft !== null && normaliseHex(draft) === null

  const pure = rgbToHex(hsvToRgb({ h: hsv.h, s: hsv.s, v: 1 }))

  return (
    <ToolWindow title="Colour wheel" reason={reason}>
      <div className="wheel">
        <div
          ref={wheelRef}
          className="wheel__disc"
          role="application"
          tabIndex={0}
          aria-label={`Colour wheel for the palette. The selected colour is ${selected.hex}. Left and right arrows turn its hue, up and down change its saturation.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          onKeyDown={onWheelKeyDown}
          style={{ '--wheel-dim': `${(1 - hsv.v) * 0.85}` } as CSSProperties}
        >
          {blocks.map((block) => {
            const { h, s } = hsvOf(block.hex)
            const angle = (h * Math.PI) / 180
            const isSelected = block.id === selected.id
            return (
              <span
                key={block.id}
                className="wheel__marker"
                data-selected={isSelected || undefined}
                style={{
                  left: `${50 + Math.sin(angle) * s * 50}%`,
                  top: `${50 - Math.cos(angle) * s * 50}%`,
                  background: block.hex,
                }}
                aria-hidden="true"
              />
            )
          })}
        </div>

        <div className="wheel__swatches" role="radiogroup" aria-label="Colour to edit">
          {blocks.map((block, index) => (
            <button
              key={block.id}
              type="button"
              role="radio"
              aria-checked={block.id === selected.id}
              aria-label={`Colour ${index + 1}, ${block.hex}`}
              className="wheel__swatch"
              style={{ background: block.hex, color: readableTextColour(block.hex) }}
              onClick={() => onSelect(block.id)}
            >
              {index + 1}
            </button>
          ))}
        </div>

        <div className="wheel__controls">
          <label className="wheel__field">
            <span>Hue</span>
            <input
              type="range"
              min={0}
              max={360}
              value={Math.round(hsv.h)}
              onChange={(event) => commit(selected.id, { ...hsv, h: Number(event.target.value) })}
              className="wheel__range wheel__range--hue"
            />
          </label>
          <label className="wheel__field">
            <span>Saturation</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(hsv.s * 100)}
              onChange={(event) => commit(selected.id, { ...hsv, s: Number(event.target.value) / 100 })}
              className="wheel__range"
              style={{ background: `linear-gradient(to right, ${rgbToHex(hsvToRgb({ h: hsv.h, s: 0, v: hsv.v }))}, ${rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: hsv.v }))})` }}
            />
          </label>
          <label className="wheel__field">
            <span>Brightness</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(hsv.v * 100)}
              onChange={(event) => commit(selected.id, { ...hsv, v: Number(event.target.value) / 100 })}
              className="wheel__range"
              style={{ background: `linear-gradient(to right, #000000, ${pure})` }}
            />
          </label>
          <label className="wheel__field wheel__field--hex">
            <span>Hex</span>
            <input
              className="wheel__hex"
              value={draft ?? selected.hex}
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
        </div>
      </div>
    </ToolWindow>
  )
}
