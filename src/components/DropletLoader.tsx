import { useId, type CSSProperties } from 'react'
import './DropletLoader.css'

// The mark's own outline, from src/assets/brand/icon-dark.svg, split into the blob and the hole in the middle. Nothing is added to
// it: the loader is only the logo, rippling. The mark is cut into thin horizontal bands, and each band slides sideways by a sine of
// its height and of time (see the CSS), so a wave runs down the whole logo and then it settles back to its own shape.
const OUTER =
  'M540 145.64C797.698 132.211 935.181 265.857 935.181 540.82C935.181 815.784 802.814 936 540 936C259.281 936 144.819 809.389 144.819 540.82C144.819 252.428 291.591 158.584 540 145.64Z'
const HOLE =
  'M751.019 540.785C751.018 393.686 677.606 322.19 540 329.374C407.354 336.299 328.982 386.503 328.981 540.785C328.981 684.463 390.102 752.197 540 752.197C680.338 752.197 751.019 687.884 751.019 540.785Z'

// The mark spans y = 145 to 936 in the artboard. Thin enough that the bands read as one smooth shape at any size.
const BANDS = 32
const TOP = 140
const BOTTOM = 940
const STEP = (BOTTOM - TOP) / BANDS
// Bands overlap a little, so no seam shows between them where the pixels do not line up.
const OVERLAP = 1.5

type Props = {
  // Any CSS length, the width of the artboard. The mark fills about three quarters of it, with room around it for the wave.
  size?: string
}

// Decorative: whatever shows it says in words that something is happening.
export default function DropletLoader({ size = '1.9rem' }: Props) {
  // The ids go into url(), where the colons React puts in generated ids are not allowed.
  const id = `droplet-${useId().replace(/:/g, '')}`

  return (
    <svg className="loader" viewBox="0 0 1080 1080" style={{ width: size }} aria-hidden="true" focusable="false">
      <defs>
        <mask id={`${id}-hole`}>
          <rect width="1080" height="1080" fill="white" />
          <path d={HOLE} fill="black" />
        </mask>
        <path id={`${id}-mark`} className="loader__body" d={OUTER} mask={`url(#${id}-hole)`} />
        {Array.from({ length: BANDS }, (_, band) => (
          <clipPath key={band} id={`${id}-band-${band}`}>
            <rect x="-400" y={TOP + band * STEP - OVERLAP} width="1880" height={STEP + OVERLAP * 2} />
          </clipPath>
        ))}
      </defs>

      <g className="loader__waves">
        {Array.from({ length: BANDS }, (_, band) => (
          // The band's window stays where it is. The mark slides behind it.
          <g key={band} clipPath={`url(#${id}-band-${band})`}>
            <g className="loader__band" style={{ '--band': band } as CSSProperties}>
              <use href={`#${id}-mark`} />
            </g>
          </g>
        ))}
      </g>
    </svg>
  )
}
