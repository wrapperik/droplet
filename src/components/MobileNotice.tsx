import { useEffect, useId, useRef, useState } from 'react'
import { LaptopIcon } from '@solar-icons/react/linear'
import './MobileNotice.css'

// Phones and narrow tablets: below the width where the workspace frame has room for its stage and tools panel side by side.
export const MOBILE_QUERY = '(max-width: 767px)'
// Once dismissed, the notice stays away for the rest of the visit.
const DISMISSED_KEY = 'droplet-mobile-notice-dismissed'

const isNarrow = () => typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches

const wasDismissed = () => {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

// Droplet is built for a desktop screen. On a phone it says so once, plainly, and the founder can carry on anyway.
export default function MobileNotice() {
  const [open, setOpen] = useState(() => isNarrow() && !wasDismissed())
  const titleId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)

  const dismiss = () => {
    setOpen(false)
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Without storage it only comes back on the next visit.
    }
  }

  useEffect(() => {
    if (open) buttonRef.current?.focus()
  }, [open])

  if (!open) return null
  return (
    <div className="mobile-notice__backdrop">
      <div
        className="mobile-notice glass glass--strong"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') dismiss()
        }}
      >
        <span className="mobile-notice__icon" aria-hidden="true">
          <LaptopIcon size={24} />
        </span>
        <h2 className="mobile-notice__title" id={titleId}>
          Best on a desktop for now
        </h2>
        <p className="mobile-notice__text">This site is not yet optimised for mobile devices. We are working on it! For now, try it on desktop.</p>
        <button ref={buttonRef} type="button" className="mobile-notice__button" onClick={dismiss}>
          Continue anyway
        </button>
      </div>
    </div>
  )
}
