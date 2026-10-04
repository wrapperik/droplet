import { useState } from 'react'
import './RippleGlow.css'

type Props = {
  // Whether Droplet is working. The light fades in when it starts, and fades out, rather than stopping, when it ends.
  active: boolean
}

// The light that goes with the ripple of the windows (see useRipple): a few large, soft orbs of blue that drift slowly across the
// screen, like the light reflected off moving water. They have no edges of their own, and the whole layer fades out towards its
// sides, so nothing is ever cut off. It lies over the screen and lets every press through. With reduced motion there is none.
export default function RippleGlow({ active }: Props) {
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [shown, setShown] = useState(false)

  // Starts when Droplet starts working.
  if (active && !reduced && !shown) setShown(true)
  if (!shown || reduced) return null

  return (
    <div
      className="glow"
      aria-hidden="true"
      data-state={active ? 'on' : 'off'}
      // The fade out is the only animation on the layer that ends, so when it has, the light is gone.
      onAnimationEnd={(event) => {
        if (!active && event.target === event.currentTarget) setShown(false)
      }}
    >
      <span className="glow__orb glow__orb--1" />
      <span className="glow__orb glow__orb--2" />
      <span className="glow__orb glow__orb--3" />
      <span className="glow__orb glow__orb--4" />
    </div>
  )
}
