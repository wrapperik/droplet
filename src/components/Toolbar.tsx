import { useId, type ReactNode } from 'react'
import { InfoCircleIcon } from '@solar-icons/react/linear'
import './Toolbar.css'

type ToolbarProps = {
  // Shown at the left of the pill and used as its accessible name.
  title: string
  // One line saying why this component is on screen (manifesto principle 3). Shown from an info button.
  reason: string
  children: ReactNode
  className?: string
}

// A compact pill of controls. Reference: docs/ui-references/08-toolbars.png.
// The pill fills whatever grid columns it is given, so its edges always sit on grid lines. The title sits at
// the left and the tools are centred in the space that remains. `data-intrinsic` marks the parts whose natural
// widths the grid adds up to decide how many columns the toolbar needs.
export function Toolbar({ title, reason, children, className }: ToolbarProps) {
  return (
    <div className={`toolbar glass glass--strong ${className ?? ''}`} role="group" aria-label={title}>
      <div className="toolbar__lead" data-intrinsic="">
        <span className="toolbar__title">{title}</span>
        <ReasonTip reason={reason} />
        <ToolbarDivider />
      </div>
      <div className="toolbar__centre">
        <div className="toolbar__tools" data-intrinsic="">
          {children}
        </div>
      </div>
    </div>
  )
}

export function ToolbarDivider() {
  return <span className="toolbar__divider" aria-hidden="true" />
}

// Every component says why it is on screen (manifesto principle 3). In a toolbar that is a small info
// button; the reason shows on hover or focus and is announced as the button's description.
export function ReasonTip({ reason }: { reason: string }) {
  const id = useId()
  return (
    <span className="reason">
      <button type="button" className="toolbar__button reason__button" aria-label="Why is this here?" aria-describedby={id}>
        <InfoCircleIcon size={18} aria-hidden="true" />
      </button>
      <span role="tooltip" id={id} className="reason__tip glass glass--strong">
        {reason}
      </span>
    </span>
  )
}
