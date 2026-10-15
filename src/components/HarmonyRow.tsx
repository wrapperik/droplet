import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AltArrowLeftIcon, AltArrowRightIcon } from '@solar-icons/react/linear'
import { HARMONY_DIAGRAM, HARMONY_NOTES, HARMONY_RULES, harmonyLabel, type Harmony } from '../lib/harmony.ts'
import './HarmonyRow.css'

type Props = {
  harmony: Harmony
  // Choosing a rule works the colours that are not kept out from the selected one, in one undo step. Choosing Custom changes nothing but the rule.
  onChoose: (harmony: Harmony) => void
}

const SIZE = 36
const MIDDLE = SIZE / 2
const RING = 13

// A harmony drawn as the shape it makes on a ring: a dot for each colour, the one it starts from larger. Drawn in the current text colour, so it follows the theme.
export function HarmonyIcon({ harmony }: { harmony: Harmony }) {
  const points = HARMONY_DIAGRAM[harmony].map(({ angle, radius }, index) => {
    const radians = (angle * Math.PI) / 180
    return { x: MIDDLE + Math.sin(radians) * RING * radius, y: MIDDLE - Math.cos(radians) * RING * radius, base: index === 0 }
  })
  const isShape = harmony !== 'custom' && harmony !== 'monochrome'
  return (
    <svg className="hicon" viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true" focusable="false">
      <circle cx={MIDDLE} cy={MIDDLE} r={RING} className="hicon__ring" />
      {isShape && <polygon className="hicon__shape" points={points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')} />}
      {harmony === 'monochrome' && <line className="hicon__shape" x1={MIDDLE} y1={MIDDLE} x2={points[0].x} y2={points[0].y} />}
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={point.base ? 3.4 : 2.6} className={point.base ? 'hicon__dot hicon__dot--base' : 'hicon__dot'} />
      ))}
    </svg>
  )
}

// "Colour harmonies: Analogous" and a row of the rules, each a small diagram of the shape it makes on the wheel. The row scrolls sideways, with arrow buttons that
// say what they do, when the rules do not all fit.
export default function HarmonyRow({ harmony, onChoose }: Props) {
  const headingId = useId()
  const rowRef = useRef<HTMLDivElement>(null)
  const [reach, setReach] = useState({ before: false, after: false })

  const measure = useCallback(() => {
    const row = rowRef.current
    if (!row) return
    setReach({ before: row.scrollLeft > 1, after: row.scrollLeft + row.clientWidth < row.scrollWidth - 1 })
  }, [])

  useEffect(() => {
    measure()
    const row = rowRef.current
    if (!row || typeof ResizeObserver === 'undefined') return
    const watcher = new ResizeObserver(measure)
    watcher.observe(row)
    return () => watcher.disconnect()
  }, [measure])

  const scroll = (direction: -1 | 1) => {
    const row = rowRef.current
    if (!row) return
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    row.scrollBy?.({ left: direction * Math.max(120, row.clientWidth * 0.7), behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    <section className="harmonies" aria-labelledby={headingId}>
      <h3 className="harmonies__heading" id={headingId}>
        Colour harmonies: <span className="harmonies__current">{harmonyLabel(harmony)}</span>
      </h3>
      <div className="harmonies__frame">
        {reach.before && (
          <button type="button" className="harmonies__arrow harmonies__arrow--before" aria-label="Show earlier harmonies" onClick={() => scroll(-1)}>
            <AltArrowLeftIcon size={18} aria-hidden="true" />
          </button>
        )}
        <div ref={rowRef} className="harmonies__row" role="group" aria-label="Harmony rules" onScroll={measure}>
          {HARMONY_RULES.map((rule) => (
            <button
              key={rule.id}
              type="button"
              className="harmonies__rule"
              aria-pressed={harmony === rule.id}
              aria-label={rule.label}
              title={`${rule.label}. ${HARMONY_NOTES[rule.id]}`}
              onClick={() => onChoose(rule.id)}
            >
              <HarmonyIcon harmony={rule.id} />
            </button>
          ))}
        </div>
        {reach.after && (
          <button type="button" className="harmonies__arrow harmonies__arrow--after" aria-label="Show more harmonies" onClick={() => scroll(1)}>
            <AltArrowRightIcon size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="harmonies__note">{HARMONY_NOTES[harmony]}</p>
    </section>
  )
}
