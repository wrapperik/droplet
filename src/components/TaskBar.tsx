import { useId, type ReactNode } from 'react'
import { CheckIcon } from '@solar-icons/react/linear'
import type { Icon } from '@solar-icons/react/lib/types'
import { TipContext } from './taskBarContext.ts'
import './TaskBar.css'

// The bar under the header, for every workspace: the same glass pill in the same place, never draggable, with every item a Solar icon and its name, so a
// founder who has used one task has learnt them all. It has two uses, from one component. A task with PARTS (the invoice, the brand) lists its parts, each
// with a mark that is an empty ring until the part is complete and a tick in a filled circle once it is; pressing one goes to that part. A task with TOOLS (the
// board) lists its tools, each of which draws its own control (the button that puts it in hand, and its options). Either way the full title and the one-line
// reason (manifesto principle 3) are a tooltip, on hover and on keyboard focus.

export type BarItem = {
  id: string
  // The full name and the one-line reason, in the tooltip.
  title: string
  reason: string
  // What the item is called on the bar, always visible. Short enough for several to sit side by side.
  label: string
  icon: Icon
  // A part: whether it is complete. Left out when the item has nothing to complete.
  done?: boolean
  // A part: the one the founder is on or looking at. `step` for the guide's current step, `location` for the part in view in Workspace mode.
  current?: 'step' | 'location'
  // A part the founder cannot go to yet. It is shown, so they see what is coming, but pressing it does nothing.
  locked?: boolean
  onSelect?: () => void
  // A tool draws its own control, in place of the button (which would be a part's). It reads the tooltip's id from `useBarTip` (taskBarContext).
  control?: ReactNode
}

type Props = {
  kind: 'parts' | 'tools'
  // The bar's accessible name, such as "Parts of the invoice".
  label: string
  items: BarItem[]
}

export default function TaskBar({ kind, label, items }: Props) {
  const tipBase = useId()
  return (
    <div className="taskbar" role={kind === 'tools' ? 'toolbar' : 'group'} aria-label={label} data-kind={kind}>
      {items.map((item) => {
        const tipId = `${tipBase}-${item.id}`
        const ItemIcon = item.icon
        return (
          <div key={item.id} className="taskbar__item" data-id={item.id} data-current={item.current ? '' : undefined}>
            {item.control ? (
              <TipContext.Provider value={tipId}>{item.control}</TipContext.Provider>
            ) : (
              <button
                type="button"
                className="taskbar__button"
                aria-current={item.current}
                aria-disabled={item.locked || undefined}
                aria-describedby={tipId}
                data-locked={item.locked || undefined}
                onClick={() => {
                  if (!item.locked) item.onSelect?.()
                }}
              >
                <ItemIcon size={18} aria-hidden="true" />
                <span className="taskbar__label">{item.label}</span>
                {item.done !== undefined && (
                  <span className="taskbar__mark" data-done={item.done || undefined} aria-hidden="true">
                    {item.done && <CheckIcon size={12} strokeWidth={2.25} />}
                  </span>
                )}
                {/* The comma keeps it apart from the name when the two are read as one. */}
                {item.done !== undefined && <span className="visually-hidden">{item.done ? ', complete' : ', not complete yet'}</span>}
                {item.locked && <span className="visually-hidden">, not reached yet</span>}
              </button>
            )}
            <span role="tooltip" id={tipId} className="taskbar__tip glass glass--strong">
              <strong>{item.title}</strong>
              {item.reason}
            </span>
          </div>
        )
      })}
    </div>
  )
}
