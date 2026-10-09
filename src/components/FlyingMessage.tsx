import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { FLIGHT_MS, flightFrame, type Rect } from '../lib/flight.ts'
import './FlyingMessage.css'

export type FlightOrigin = Rect

type Props = {
  // The id of the message that is on its way, and its words.
  messageId: number
  text: string
  // Where the bar was when the message was sent, for its sides; its top is followed live, since the bar may be moving.
  from: FlightOrigin
  onEnd: () => void
}

const rectOf = (element: Element): Rect => {
  const box = element.getBoundingClientRect()
  return { left: box.left, top: box.top, width: box.width, height: box.height }
}

// The shape that carries a message from the bar to its place in the thread. It is a copy of the message drawn over everything, moved by hand each
// frame towards where the message is at that moment (the real one is there, not shown, so the thread's layout is final from the start), and it
// ends the moment it arrives, when the real one is shown. It is decoration: the real message is in the thread for a screen reader the whole time.
export default function FlyingMessage({ messageId, text, from, onEnd }: Props) {
  const shape = useRef<HTMLDivElement>(null)
  const words = useRef<HTMLSpanElement>(null)
  const ended = useRef(false)

  const end = () => {
    if (ended.current) return
    ended.current = true
    onEnd()
  }

  useLayoutEffect(() => {
    // React runs an effect, undoes it and runs it again in development, so a flight that was ended by the first run must not stay ended.
    ended.current = false
    const element = shape.current
    const inner = words.current
    const target = document.querySelector(`[data-message-id="${messageId}"]`)
    if (!element || !inner || !target || rectOf(target).width === 0) {
      end()
      return
    }
    const look = getComputedStyle(target)
    const radius = parseFloat(look.borderTopLeftRadius) || 24
    // The words of the finished message are this wide, so they are laid out at this width from the first frame and never reflow.
    const wordsAcross = () => (target.clientWidth || 0) - (parseFloat(look.paddingLeft) || 0) - (parseFloat(look.paddingRight) || 0)
    const started = performance.now()
    let frame = 0
    const tick = () => {
      // The clock is read here, not taken from the frame's own timestamp, so the two can never be on different scales.
      const t = (performance.now() - started) / FLIGHT_MS
      const there = document.querySelector(`[data-message-id="${messageId}"]`)
      if (!there) return end()
      const bar = document.querySelector('.intent__bar')
      const placed = flightFrame(t, bar ? { ...from, ...rectOf(bar) } : from, rectOf(there), radius)
      element.style.left = `${placed.left}px`
      element.style.top = `${placed.top}px`
      element.style.width = `${placed.width}px`
      element.style.height = `${placed.height}px`
      element.style.borderRadius = `${placed.radius}px`
      element.style.clipPath = placed.clipBottom > 0 ? `inset(0 0 ${placed.clipBottom}px 0)` : 'none'
      // The words keep the width they will have, so they never reflow on the way; the shape only shows more of them.
      inner.style.width = `${wordsAcross()}px`
      inner.style.opacity = String(placed.textOpacity)
      if (t >= 1) return end()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    // However it goes, it does not outstay: the real message is shown at the latest a little after the flight should have ended.
    const limit = window.setTimeout(end, FLIGHT_MS + 600)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(limit)
    }
    // Once, when the message is sent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  return createPortal(
    <div ref={shape} className="thread__message thread__message--you glass flying" aria-hidden="true">
      <span ref={words} className="flying__words">
        {text}
      </span>
    </div>,
    document.body,
  )
}
