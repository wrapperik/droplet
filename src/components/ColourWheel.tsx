import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv, type Hsv } from '../lib/colour.ts'
import './ColourWheel.css'

type Block = { id: number; hex: string }

type Props = {
  blocks: Block[]
  selectedId: number
  onSelect: (id: number) => void
  // Changes one colour. The wheel works on whichever colour the pointer picked up, which may not be the selected one yet. With a harmony chosen the owner of this
  // callback decides what else moves with it.
  onChange: (id: number, hex: string) => void
  // A harmony is chosen: a line joins each colour to the middle, so the shape the rule makes can be seen.
  showRule?: boolean
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const hsvOf = (hex: string): Hsv => rgbToHsv(hexToRgb(hex))
// How close, in pixels, a press must be to a colour's marker to pick that marker up.
const PICK_RADIUS_PX = 16

// The colour wheel, with every colour in the palette on it, and a brightness slider under it. Drag a colour to change its hue and saturation. The fields for the
// exact value (hex, red, green and blue) are in `ColourFields`, so nothing needs the pointer: the wheel is also moved with the arrow keys.
export default function ColourWheel({ blocks, selectedId, onSelect, onChange, showRule = false }: Props) {
  const dragRef = useRef<number | null>(null)
  const selected = blocks.find((block) => block.id === selectedId) ?? blocks[0]
  const hsv = hsvOf(selected.hex)

  const commit = (blockId: number, next: Hsv) => onChange(blockId, rgbToHex(hsvToRgb(next)))

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
    event.currentTarget.setPointerCapture?.(event.pointerId)
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

  const pure = rgbToHex(hsvToRgb({ h: hsv.h, s: hsv.s, v: 1 }))
  const place = (hex: string) => {
    const { h, s } = hsvOf(hex)
    const angle = (h * Math.PI) / 180
    return { x: 50 + Math.sin(angle) * s * 50, y: 50 - Math.cos(angle) * s * 50 }
  }

  return (
    <div className="wheel">
      <div
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
        {showRule && (
          <svg className="wheel__rays" viewBox="0 0 100 100" aria-hidden="true">
            {blocks.map((block) => {
              const at = place(block.hex)
              return <line key={block.id} x1="50" y1="50" x2={at.x} y2={at.y} />
            })}
          </svg>
        )}
        {blocks.map((block) => {
          const at = place(block.hex)
          return (
            <span
              key={block.id}
              className="wheel__marker"
              data-selected={block.id === selected.id || undefined}
              style={{ left: `${at.x}%`, top: `${at.y}%`, background: block.hex }}
              aria-hidden="true"
            />
          )
        })}
      </div>

      <label className="wheel__brightness">
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
    </div>
  )
}
