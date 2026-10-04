import { useId, useState } from 'react'
import { MAX_SUMMARY_LINES, MAX_SUMMARY_LINE, SUMMARY_LABELS, SUMMARY_SECTIONS, type BoardSummary, type SummarySection } from '../../lib/boardTypes.ts'
import { cleanLines } from '../../lib/boardState.ts'
import type { ProjectMemory } from '../../lib/memorySave.ts'
import type { IdeaKind } from '../../lib/projectMemory.ts'
import ToolWindow from '../ToolWindow.tsx'
import '../invoice/InvoiceWindows.css'
import './SummaryWindow.css'

type Props = {
  summary: BoardSummary | null
  // What the project remembers of the name and the offer, if anything.
  memory: ProjectMemory
  // The founder wrote in a section: its lines, one to a line. Each keystroke is one step in the history, merged with the ones before it.
  onEdit: (section: SummarySection, lines: string[]) => void
  // Asks Droplet to write the summary. Nothing is written until it answers.
  onAsk: () => void
  // Forgets the name or the offer that was remembered (behind a second press).
  onForget: (kind: IdeaKind) => void
  reason: string
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((line, index) => line === b[index])

// One section as a text box with a line to each point. What is typed stays as typed (a new line is allowed to be empty while it is
// being written), and is tidied when it is read: the box follows the summary again when it changes from outside, such as Undo.
function Section({ section, lines, onEdit }: { section: SummarySection; lines: string[]; onEdit: (lines: string[]) => void }) {
  const id = useId()
  const [draft, setDraft] = useState(lines.join('\n'))
  if (!same(cleanLines(draft.split('\n')), lines)) setDraft(lines.join('\n'))
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {SUMMARY_LABELS[section]}
      </label>
      <textarea
        id={id}
        className="field__input field__input--area"
        rows={Math.max(3, Math.min(MAX_SUMMARY_LINES, draft.split('\n').length + 1))}
        value={draft}
        placeholder="One point to a line"
        onChange={(event) => {
          setDraft(event.target.value)
          onEdit(event.target.value.split('\n'))
        }}
        onBlur={() => setDraft(lines.join('\n'))}
      />
      <span className="field__hint">
        Up to {MAX_SUMMARY_LINES} lines of {MAX_SUMMARY_LINE} characters.
      </span>
    </div>
  )
}

// What the project has remembered from this board: the name and the offer the founder decided on. Droplet never writes these. They are put
// here from the board with the selection bar and a confirm, and forgotten here.
function Decisions({ memory, onForget }: { memory: ProjectMemory; onForget: (kind: IdeaKind) => void }) {
  const [asking, setAsking] = useState<IdeaKind | null>(null)
  const rows: { kind: IdeaKind; label: string; value: string | null | undefined }[] = [
    { kind: 'name', label: 'Business name', value: memory.idea?.name },
    { kind: 'offer', label: 'Offer', value: memory.idea?.offer },
  ]
  return (
    <div className="summary__decisions">
      <h3 className="fields__group">Remembered for this project</h3>
      {rows.map(({ kind, label, value }) => (
        <div key={kind} className="summary__remembered">
          <span className="field__label">{label}</span>
          {value ? (
            <>
              <span className="summary__value">{value}</span>
              {asking === kind ? (
                <span className="remembered__ask">
                  <span>Forget it?</span>
                  <button type="button" className="remembered__button remembered__button--danger" onClick={() => { onForget(kind); setAsking(null) }}>
                    Forget
                  </button>
                  <button type="button" className="remembered__button" onClick={() => setAsking(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button type="button" className="remembered__button" aria-label={`Forget the ${label.toLowerCase()}`} onClick={() => setAsking(kind)}>
                  Forget
                </button>
              )}
            </>
          ) : (
            <span className="field__hint">{kind === 'name' ? 'Select a note and choose "Use as business name".' : 'Select a note and choose "Use as offer".'}</span>
          )}
        </div>
      ))}
    </div>
  )
}

// The summary of the board: what is decided, what is still open and what comes next, kept apart from the board itself. Droplet writes it only
// when asked and the founder can change every line. Once the founder has, it says so and Droplet is told, so a rewrite is a choice.
export default function SummaryWindow({ summary, memory, onEdit, onAsk, onForget, reason }: Props) {
  const empty = !summary
  return (
    <ToolWindow title="Summary" reason={reason}>
      <div className="fields summary">
        {empty && (
          <div className="summary__empty">
            <p className="fields__note">No summary yet. Droplet can write one from the board when you ask, or you can write it yourself in the boxes below.</p>
            <button type="button" className="summary__ask" onClick={onAsk}>
              Ask Droplet to write one
            </button>
          </div>
        )}
        {summary && (
          <p className="fields__note summary__by">
            {summary.by === 'droplet' ? (summary.edited ? 'Written by Droplet, changed by you.' : 'Written by Droplet.') : 'Written by you.'}{' '}
            <button type="button" className="remembered__button" onClick={onAsk}>
              {summary.by === 'droplet' && summary.edited ? 'Ask for a new one (replaces your changes)' : 'Ask Droplet to write a new one'}
            </button>
          </p>
        )}
        {SUMMARY_SECTIONS.map((section) => (
          <Section key={section} section={section} lines={summary?.[section] ?? []} onEdit={(lines) => onEdit(section, lines)} />
        ))}
        <Decisions memory={memory} onForget={onForget} />
      </div>
    </ToolWindow>
  )
}
