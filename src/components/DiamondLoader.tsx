import './DiamondLoader.css'

// The thinking indicator: eight small squares in a diamond that light up one after another, going round. The animation is in DiamondLoader.css (not an inline style element, so the
// reduced-motion rule can reach it). Decorative: the stage in words beside it says what is happening, so it is hidden from screen readers.
const SQUARES = [
  { x: 8, y: 0 }, // top
  { x: 12, y: 4 }, // top right
  { x: 16, y: 8 }, // right
  { x: 12, y: 12 }, // bottom right
  { x: 8, y: 16 }, // bottom
  { x: 4, y: 12 }, // bottom left
  { x: 0, y: 8 }, // left
  { x: 4, y: 4 }, // top left
]

export default function DiamondLoader() {
  return (
    <svg className="diamond" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
      {SQUARES.map((square, index) => (
        <rect key={index} className="diamond__square" style={{ '--i': index } as React.CSSProperties} x={square.x} y={square.y} width="4" height="4" />
      ))}
    </svg>
  )
}
