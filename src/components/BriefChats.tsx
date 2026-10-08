import { useCallback, useEffect, useId, useState } from 'react'
import { PenIcon, TrashBinMinimalisticIcon } from '@solar-icons/react/linear'
import { MAX_SUMMARY_LINES, summarySchema, type ChatSummary } from '../compose/background.ts'
import { loadChats, saveChats, whenLabel, type StoredChat } from '../lib/chatStore.ts'
import './BriefChats.css'

type Props = {
  projectId: string
  // Droplet is looking back at past chats, or the founder has switched that off. The memories are shown either way, so they can still be read and deleted.
  lookingBack: boolean
  // Chats are read and written one after another, so a change here never crosses the save of a chat in progress.
  enqueue: <T>(task: () => Promise<T>) => Promise<T>
  onChanged?: () => void
}

// The short memories Droplet keeps of past chats, to read, change and delete. A memory the founder changes is theirs from then on: it is not written
// over when the chat is looked at again.
export default function BriefChats({ projectId, lookingBack, enqueue, onChanged }: Props) {
  const [chats, setChats] = useState<StoredChat[] | null>(null)
  const headingId = useId()

  const reload = useCallback(() => enqueue(async () => setChats(await loadChats(projectId))), [enqueue, projectId])
  useEffect(() => {
    void reload()
  }, [reload])

  // Changes one chat's memory and writes it back, behind any chat save on its way.
  const change = useCallback(
    async (id: string, update: (chat: StoredChat) => StoredChat) => {
      await enqueue(async () => {
        const all = await loadChats(projectId)
        await saveChats(projectId, all.map((chat) => (chat.id === id ? update(chat) : chat)))
        setChats(await loadChats(projectId))
      })
      onChanged?.()
    },
    [enqueue, projectId, onChanged],
  )

  const remembered = (chats ?? []).filter((chat) => chat.summary)

  return (
    <section className="brief__section" aria-labelledby={headingId}>
      <h3 className="brief__heading" id={headingId}>
        Past chats Droplet remembers
      </h3>
      {!lookingBack && <p className="brief__empty">Droplet is not looking back at past chats. These are kept until you delete them.</p>}
      {chats === null ? (
        <p className="brief__empty">Reading the chats…</p>
      ) : remembered.length === 0 ? (
        <p className="brief__empty">Nothing yet. A short memory is written when you leave a chat you have said something in.</p>
      ) : (
        <ul className="brief__list">
          {remembered.map((chat) => (
            <Memory
              key={chat.id}
              chat={chat}
              onSave={(summary) => change(chat.id, (current) => ({ ...current, summary, summaryEdited: true, summarisedAt: laterOf(new Date().toISOString(), current.updatedAt) }))}
              // A deleted memory stays deleted until the chat changes: it counts as looked at.
              onDelete={() => void change(chat.id, ({ summary: _gone, summaryEdited: _edited, ...current }) => ({ ...current, summarisedAt: laterOf(new Date().toISOString(), current.updatedAt) }))}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

const laterOf = (a: string, b: string) => (a > b ? a : b)

const linesOf = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean)

function Memory({ chat, onSave, onDelete }: { chat: StoredChat; onSave: (summary: ChatSummary) => Promise<void>; onDelete: () => void }) {
  const summary = chat.summary!
  const [mode, setMode] = useState<'read' | 'edit' | 'delete'>('read')
  const [subject, setSubject] = useState(summary.subject)
  const [decided, setDecided] = useState(summary.decided.join('\n'))
  const [open, setOpen] = useState(summary.open.join('\n'))
  const [problem, setProblem] = useState('')

  const save = async () => {
    const next = { ...summary, subject: subject.trim(), decided: linesOf(decided), open: linesOf(open) }
    const parsed = summarySchema.safeParse(next)
    if (!parsed.success) return setProblem('Write a subject, and keep each line short: up to four lines in each box.')
    if (1 + parsed.data.decided.length + parsed.data.open.length > MAX_SUMMARY_LINES) return setProblem(`Keep it to ${MAX_SUMMARY_LINES} lines in all.`)
    await onSave(parsed.data)
    setProblem('')
    setMode('read')
  }

  return (
    <li className="memory">
      <div className="memory__head">
        <span className="memory__title">{chat.title}</span>
        <span className="memory__when">{whenLabel(chat.updatedAt)}{chat.summaryEdited ? ' · written by you' : ''}</span>
      </div>
      {mode === 'edit' ? (
        <div className="memory__edit">
          <label>
            <span>Subject</span>
            <input className="brief__input" value={subject} maxLength={120} onChange={(event) => setSubject(event.target.value)} />
          </label>
          <label>
            <span>Decided (one to a line)</span>
            <textarea className="brief__input memory__area" rows={3} value={decided} onChange={(event) => setDecided(event.target.value)} />
          </label>
          <label>
            <span>Still open (one to a line)</span>
            <textarea className="brief__input memory__area" rows={3} value={open} onChange={(event) => setOpen(event.target.value)} />
          </label>
          {problem && (
            <p className="brief__error" role="alert">
              {problem}
            </p>
          )}
          <span className="brief__actions">
            <button type="button" className="brief__small brief__small--primary" onClick={() => void save()}>
              Save
            </button>
            <button type="button" className="brief__small" onClick={() => setMode('read')}>
              Cancel
            </button>
          </span>
        </div>
      ) : (
        <ul className="memory__lines">
          <li>About: {summary.subject}</li>
          {summary.decided.map((line) => (
            <li key={`d-${line}`}>Decided: {line}</li>
          ))}
          {summary.open.map((line) => (
            <li key={`o-${line}`}>Still open: {line}</li>
          ))}
        </ul>
      )}
      {mode === 'read' && (
        <span className="brief__actions">
          <button
            type="button"
            className="brief__icon"
            aria-label={`Edit the memory of ${chat.title}`}
            onClick={() => {
              setSubject(summary.subject)
              setDecided(summary.decided.join('\n'))
              setOpen(summary.open.join('\n'))
              setMode('edit')
            }}
          >
            <PenIcon size={16} aria-hidden="true" />
          </button>
          <button type="button" className="brief__icon" aria-label={`Delete the memory of ${chat.title}`} onClick={() => setMode('delete')}>
            <TrashBinMinimalisticIcon size={16} aria-hidden="true" />
          </button>
        </span>
      )}
      {mode === 'delete' && (
        <span className="brief__ask">
          <span>Delete this memory? The chat stays.</span>
          <button type="button" className="brief__small brief__small--danger" onClick={onDelete}>
            Delete
          </button>
          <button type="button" className="brief__small" onClick={() => setMode('read')}>
            Keep
          </button>
        </span>
      )}
    </li>
  )
}
