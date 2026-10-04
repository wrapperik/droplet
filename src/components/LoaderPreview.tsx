import { useState, type CSSProperties } from 'react'
import DropletLoader from './DropletLoader.tsx'
import './LoaderPreview.css'

// TEMPORARY. A looping copy of the thinking animation on the Home screen, so it can be judged without sending a
// message. Remove it (and its use in pages/Home.tsx) once the animation is approved.
export default function LoaderPreview() {
  const [slow, setSlow] = useState(false)

  return (
    <section className="loader-preview" aria-label="Thinking animation preview" style={{ '--loader-loop': slow ? '9.6s' : '2.4s' } as CSSProperties}>
      <p className="loader-preview__note">Thinking animation preview. Temporary, for feedback.</p>

      <div className="loader-preview__stage">
        <DropletLoader size="9rem" />
      </div>

      {/* The same markup the chat uses, at the size it really is. */}
      <ol className="loader-preview__thread" aria-hidden="true">
        <li className="thread__message thread__message--droplet thread__message--pending">
          <span className="thread__pending">
            <DropletLoader />
            Thinking
          </span>
        </li>
      </ol>

      <button type="button" className="loader-preview__toggle" aria-pressed={slow} onClick={() => setSlow((value) => !value)}>
        Slow motion
      </button>
    </section>
  )
}
