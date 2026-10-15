import { useId, type ReactNode } from 'react'
import { InfoCircleIcon } from '@solar-icons/react/linear'
import './Toolbar.css'

type ToolbarProps = {
  // Used as the tool's accessible name. The task bar shows it as a tooltip, with the reason.
  title: string
  children: ReactNode
  className?: string
}

// One tool's controls, exactly as wide as they are. Tools sit side by side in the bar under the header
// (`TaskBar`), which draws the tooltip and the dividers between them.
export function Toolbar({ title, children, className }: ToolbarProps) {
  return (
    <div className={`toolbar ${className ?? ''}`} role="group" aria-label={title}>
      {children}
    </div>
  )
}

export function ToolbarDivider() {
  return <span className="toolbar__divider" aria-hidden="true" />
}

// Every component says why it is on screen (manifesto principle 3). In a window that is a small info button; the
// reason shows on hover or focus and is announced as the button's description.
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
