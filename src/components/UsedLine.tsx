import { useId, useState } from 'react'
import { AltArrowDownIcon } from '@solar-icons/react/linear'
import { NOT_SENT, usedLine, type Used } from '../compose/used.ts'
import './UsedLine.css'

// A quiet line under a reply saying what Droplet was given to make it. Pressing it lists each thing and what it was, and says what is never sent. It is
// built from the request that was sent, so it shows why Droplet knew something and cannot claim more than went.
export default function UsedLine({ used }: { used: Used }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  return (
    <div className="used">
      {/* Short on the page, so it does not add a line of clutter to every reply; the full "Used: ..." line is what a screen reader hears, and what the list opens to. */}
      <button type="button" className="used__line" aria-label={usedLine(used)} aria-expanded={open} aria-controls={listId} onClick={() => setOpen((value) => !value)}>
        <span className="used__text">What I used</span>
        <AltArrowDownIcon className="used__chevron" size={12} aria-hidden="true" />
      </button>
      {open && (
        <div id={listId} className="used__list">
          {used.items.length > 0 && (
            <ul>
              {used.items.map((item) => (
                <li key={item.label}>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="used__not-sent">{NOT_SENT}</p>
        </div>
      )}
    </div>
  )
}
