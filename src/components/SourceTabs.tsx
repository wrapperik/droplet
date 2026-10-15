import { useRef, type KeyboardEvent } from 'react'
import type { Icon } from '@solar-icons/react/lib/types'
import './SourceTabs.css'

export type SourceTab<Id extends string> = { id: Id; label: string; icon: Icon }

type Props<Id extends string> = {
  tabs: SourceTab<Id>[]
  value: Id
  onChange: (id: Id) => void
  // The tab list's accessible name, and a prefix for the ids that tie each tab to its panel (`${idBase}-tab-${id}`, `${idBase}-panel-${id}`).
  label: string
  idBase: string
}

// A row of tabs, each an icon and a word, the current one underlined. Left and right arrows move between them (and Home and End to the ends); choosing a tab only
// changes what is shown below, so it costs nothing to move round them.
export default function SourceTabs<Id extends string>({ tabs, value, onChange, label, idBase }: Props<Id>) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = tabs.findIndex((tab) => tab.id === value)
    let next = at
    if (event.key === 'ArrowRight') next = (at + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (at - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    onChange(tabs[next].id)
    refs.current[tabs[next].id]?.focus()
  }

  return (
    <div className="stabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const TabIcon = tab.icon
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            ref={(element) => {
              refs.current[tab.id] = element
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            className="stabs__tab"
            onClick={() => onChange(tab.id)}
          >
            <TabIcon size={18} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
