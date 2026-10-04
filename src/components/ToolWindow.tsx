import type { ReactNode } from 'react'
import { ReasonTip } from './Toolbar.tsx'
import './ToolWindow.css'

type Props = {
  title: string
  // One line on why the window is on screen (manifesto principle 3).
  reason: string
  children: ReactNode
}

// The frame of a window that was a tool before it was dragged out of the toolbar: a title, the reason, and the contents.
export default function ToolWindow({ title, reason, children }: Props) {
  return (
    <section className="window" aria-label={title}>
      <header className="window__header">
        <h2 className="window__title">{title}</h2>
        <ReasonTip reason={reason} />
      </header>
      {children}
    </section>
  )
}
