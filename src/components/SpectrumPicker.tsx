import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from '../lib/colour.ts'
import './ColourWheel.css'
import './SpectrumPicker.css'

type Props = {
  hex: string
  onChange: (hex: string) => void
  // Named for a screen reader: "colour 2".
  label: string
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

// A simple picker for one colour: a square where the left edge is grey and the top edge is bright, and a slider for the hue. The arrow keys move the square's point,
// and the hue slider is an ordinary slider, so it works without a pointer too. The exact value is in `ColourFields`.
export default function SpectrumPicker({ hex, onChange, label }: Props) {
  const areaRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const hsv = rgbToHsv(hexToRgb(hex))
  // A grey, or black, has no hue of its own to read back from its hex code, so the hue the founder was on is remembered while they drag.
  const [remembered, setRemembered] = useState(hsv.h)
  const hue = hsv.s > 0 && hsv.v > 0 ? hsv.h : remembered

  const emit = (h: number, s: number, v: number) => {
    setRemembered(h)
    onChange(rgbToHex(hsvToRgb({ h, s, v })))
  }

  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    emit(hue, clamp01((event.clientX - box.left) / box.width), clamp01(1 - (event.clientY - box.top) / box.height))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02
    if (event.key === 'ArrowLeft') emit(hue, clamp01(hsv.s - step), hsv.v)
    else if (event.key === 'ArrowRight') emit(hue, clamp01(hsv.s + step), hsv.v)
    else if (event.key === 'ArrowUp') emit(hue, hsv.s, clamp01(hsv.v + step))
    else if (event.key === 'ArrowDown') emit(hue, hsv.s, clamp01(hsv.v - step))
    else return
    event.preventDefault()
  }

  return (
    <div className="spectrum">
      <div
        ref={areaRef}
        className="spectrum__area"
        role="application"
        tabIndex={0}
        aria-label={`Spectrum for ${label}. Left and right arrows change the saturation, up and down change the brightness.`}
        style={{ '--spectrum-hue': `hsl(${Math.round(hue)} 100% 50%)` } as CSSProperties}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.setPointerCapture?.(event.pointerId)
          dragging.current = true
          fromPointer(event)
        }}
        onPointerMove={(event) => dragging.current && fromPointer(event)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={onKeyDown}
      >
        <span className="spectrum__point" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} aria-hidden="true" />
      </div>
      <label className="spectrum__hue">
        <span>Hue</span>
        <input type="range" min={0} max={360} value={Math.round(hue)} onChange={(event) => emit(Number(event.target.value), hsv.s || 0.0001, hsv.v || 0.0001)} className="wheel__range wheel__range--hue" />
      </label>
    </div>
  )
}
