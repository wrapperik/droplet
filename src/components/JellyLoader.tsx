import { useId, type CSSProperties } from 'react'
import './JellyLoader.css'

// The thinking indicator: two blobs that squeeze together and apart like jelly, turning a quarter turn each time.
// Adapted from "dovatgabriel" on Uiverse.io. It replaced ThinkingDots in the chat thread; ThinkingDots.tsx and DropletLoader.tsx are kept.
// The blobs are merged by an SVG filter (blur, then a colour matrix that sharpens the alpha), so the filter is drawn here too.
// The blur is in pixels, so the blur is scaled with the size (the original is 40 pixels wide with a blur of 6.25) or the blobs would
// merge differently. It is a fixed size for that reason, not a prop.
const SIZE = 28
const BLUR = (6.25 * SIZE) / 40

// Decorative: whatever shows it says in words that something is happening.
export default function JellyLoader() {
  // The id goes into url(), where the colons React puts in generated ids are not allowed.
  const id = `jelly-${useId().replace(/:/g, '')}`

  return (
    <span className="jelly-wrap" aria-hidden="true">
      <span className="jelly" style={{ '--uib-size': `${SIZE}px`, '--jelly-filter': `url(#${id})` } as CSSProperties} />
      <svg className="jelly__maker" width="0" height="0" focusable="false">
        <defs>
          <filter id={id}>
            <feGaussianBlur in="SourceGraphic" stdDeviation={BLUR} result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="ooze" />
            <feBlend in="SourceGraphic" in2="ooze" />
          </filter>
        </defs>
      </svg>
    </span>
  )
}
