import { useId, type ReactNode } from 'react'
import './PartSection.css'

type Props = {
  // The part's id (`client`, `colours`), on the section as `data-part` so Show me, Fix and the task bar can find it whichever mode is showing it.
  id: string
  title: string
  // One line under the title on what the part is for (manifesto principle 3).
  lead: string
  children: ReactNode
  // No card round the part: it sits directly on the screen. The brand uses it; the invoice's parts are cards.
  plain?: boolean
}

// One part of a task's tools panel: a heading, its one-line lead, and its controls. Workspace mode stacks every part of the task in the panel; Guide mode
// shows one. The section is the same either way, so a part looks and reads the same wherever it is.
export default function PartSection({ id, title, lead, children, plain = false }: Props) {
  const headingId = useId()
  return (
    <section className={plain ? 'part' : 'part workspace__card'} data-part={id} aria-labelledby={headingId} tabIndex={-1}>
      <header className="part__header">
        <h2 className="part__title" id={headingId}>
          {title}
        </h2>
        <p className="part__lead">{lead}</p>
      </header>
      {children}
    </section>
  )
}
