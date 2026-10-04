import { useId } from 'react'
import './DropletLoader.css'

// The mark's own outline, from src/assets/brand/icon-dark.svg, split into the blob and the hole in the middle so each
// can move on its own. Nothing is added to it: the loader is only the logo, moving. It crouches, springs up
// stretched, flips like a coin at the top of the hop, lands with a squash and wobbles to rest, then does it again.
const OUTER =
  'M540 145.64C797.698 132.211 935.181 265.857 935.181 540.82C935.181 815.784 802.814 936 540 936C259.281 936 144.819 809.389 144.819 540.82C144.819 252.428 291.591 158.584 540 145.64Z'
const HOLE =
  'M751.019 540.785C751.018 393.686 677.606 322.19 540 329.374C407.354 336.299 328.982 386.503 328.981 540.785C328.981 684.463 390.102 752.197 540 752.197C680.338 752.197 751.019 687.884 751.019 540.785Z'

type Props = {
  // Any CSS length, the width of the artboard. The mark fills about three quarters of it, with room around it for the hop.
  size?: string
}

// Decorative: whatever shows it says in words that something is happening.
export default function DropletLoader({ size = '1.9rem' }: Props) {
  // The id goes into a url(), where the colons React puts in generated ids are not allowed.
  const maskId = `droplet-hole-${useId().replace(/:/g, '')}`

  return (
    <svg className="loader" viewBox="0 0 1080 1080" style={{ width: size }} aria-hidden="true" focusable="false">
      <defs>
        <mask id={maskId}>
          <rect width="1080" height="1080" fill="white" />
          <path className="loader__hole" d={HOLE} fill="black" />
        </mask>
      </defs>

      <g className="loader__hop">
        <g className="loader__flip">
          <g className="loader__squash">
            <path className="loader__body" d={OUTER} mask={`url(#${maskId})`} />
          </g>
        </g>
      </g>
    </svg>
  )
}
