import './ThinkingDots.css'

// The thinking indicator: four circles that pulse in turn, each one's dot shrinking away and a ring spreading out from it.
// Adapted from "Li-Deheng" on Uiverse.io. It replaced DropletLoader in the chat thread; DropletLoader.tsx is kept for reuse.
const CIRCLES = 4

type Props = {
  // Any CSS length, the diameter of one circle. The gaps and the dots scale with it.
  size?: string
}

// Decorative: whatever shows it says in words that something is happening.
export default function ThinkingDots({ size = '0.875rem' }: Props) {
  return (
    <span className="thinking" style={{ '--thinking-size': size } as React.CSSProperties} aria-hidden="true">
      {Array.from({ length: CIRCLES }, (_, circle) => (
        <span key={circle} className="thinking__circle">
          <span className="thinking__dot" />
          <span className="thinking__outline" />
        </span>
      ))}
    </span>
  )
}
