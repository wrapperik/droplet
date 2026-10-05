import { CheckIcon } from '@solar-icons/react/linear'
import type { ChatBlock, ChecklistBlock, TableBlock } from '../compose/blocks.ts'
import { STEP_WORKSPACE, type JourneyStep } from '../compose/journey.ts'
import { InlineText } from './RichText.tsx'
import './ChatBlocks.css'

// What of a step is said where there is no workspace to open, so the plan is honest about what Droplet cannot do for it.
const OUTSIDE: Partial<Record<JourneyStep, string>> = { logo: 'Made outside Droplet', email: 'Not built yet' }

type Props = {
  blocks: ChatBlock[]
  // The ticks the founder made, by `block:item`. They win over what the reply said and over what the project shows, except for a step the project shows is done.
  checks?: Record<string, boolean>
  // The steps the project shows are done: ticked, and left alone, since the founder cannot un-save a palette by ticking a box.
  done: ReadonlySet<JourneyStep>
  // Droplet is working: Open buttons wait.
  busy?: boolean
  onToggle?: (block: number, item: number, checked: boolean) => void
  // A step's Open button was pressed. That is the founder asking outright for the workspace.
  onOpen?: (step: JourneyStep) => void
}

// The pictures Droplet can put in the chat: a table, or a checklist the founder can tick. Drawn from data by these components, never from markup.
export default function ChatBlocks({ blocks, checks, done, busy, onToggle, onOpen }: Props) {
  return (
    <div className="blocks">
      {blocks.map((block, at) =>
        block.type === 'table' ? (
          <Table key={at} block={block} />
        ) : (
          <Checklist key={at} block={block} index={at} checks={checks} done={done} busy={busy} onToggle={onToggle} onOpen={onOpen} />
        ),
      )}
    </div>
  )
}

function Table({ block }: { block: TableBlock }) {
  return (
    <div className="blocks__table-wrap" role="region" aria-label={block.title ?? 'Table'} tabIndex={0}>
      <table className="blocks__table">
        {block.title && <caption>{block.title}</caption>}
        <thead>
          <tr>
            {block.columns.map((column, at) => (
              <th key={at} scope="col">
                <InlineText text={column} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowAt) => (
            <tr key={rowAt}>
              {row.map((cell, at) =>
                at === 0 ? (
                  <th key={at} scope="row">
                    <InlineText text={cell} />
                  </th>
                ) : (
                  <td key={at}>
                    <InlineText text={cell} />
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type ChecklistProps = Pick<Props, 'checks' | 'done' | 'busy' | 'onToggle' | 'onOpen'> & { block: ChecklistBlock; index: number }

function Checklist({ block, index, checks, done, busy, onToggle, onOpen }: ChecklistProps) {
  const state = block.items.map((item, at) => {
    // Locked when the project shows the step is done: that comes from what is saved, not from a box.
    const locked = item.step !== undefined && done.has(item.step)
    return { locked, ticked: locked || (checks?.[`${index}:${at}`] ?? item.done === true) }
  })
  // In a plan, the first step still to do is the one to do next.
  const next = block.numbered ? state.findIndex((entry) => !entry.ticked) : -1
  const List = block.numbered ? 'ol' : 'ul'

  return (
    <section className="blocks__checklist" aria-label={block.title ?? (block.numbered ? 'Plan' : 'Checklist')}>
      {block.title && <h3 className="blocks__title">{block.title}</h3>}
      <List className="blocks__list" role="list">
        {block.items.map((item, at) => {
          const { locked, ticked } = state[at]
          const workspace = item.step ? STEP_WORKSPACE[item.step] : null
          const outside = item.step ? OUTSIDE[item.step] : undefined
          return (
            <li key={at} className="blocks__item" data-ticked={ticked || undefined} data-next={at === next || undefined}>
              <label className="blocks__label">
                <input
                  type="checkbox"
                  className="blocks__input"
                  checked={ticked}
                  disabled={locked}
                  onChange={(event) => onToggle?.(index, at, event.target.checked)}
                />
                <span className="blocks__marker" aria-hidden="true">
                  {ticked ? <CheckIcon size={13} strokeWidth={2.5} /> : block.numbered ? at + 1 : null}
                </span>
                <span className="blocks__text">
                  <span className="blocks__name">
                    <InlineText text={item.label} />
                    {at === next && <span className="visually-hidden"> (next)</span>}
                    {locked && <span className="visually-hidden"> (already in your project)</span>}
                  </span>
                  {item.detail && (
                    <span className="blocks__detail">
                      <InlineText text={item.detail} />
                    </span>
                  )}
                </span>
              </label>
              {workspace && onOpen && item.step && (
                <button type="button" className="blocks__open" disabled={busy} onClick={() => onOpen(item.step!)} aria-label={`Open ${item.label}`}>
                  Open
                </button>
              )}
              {outside && <span className="blocks__tag">{outside}</span>}
            </li>
          )
        })}
      </List>
    </section>
  )
}
