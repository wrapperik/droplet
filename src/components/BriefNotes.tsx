import { useCallback, useEffect, useId, useState } from 'react'
import { PenIcon, RefreshIcon, TrashBinMinimalisticIcon } from '@solar-icons/react/linear'
import { MAX_DIGEST_CHARS, NOTE_WORKSPACES, NOTES_TITLES, type NotesWorkspace } from '../compose/digest.ts'
import { whenLabel } from '../lib/chatStore.ts'
import { fingerprint, printNotes, type NotesDoc } from '../lib/notes.ts'
import { updateIndex, writeDigest } from '../lib/notesKeeper.ts'
import { loadNotes, saveNotes } from '../lib/notesStore.ts'
import './BriefNotes.css'

type Props = {
  projectId: string
  projectName: string
  // Droplet is keeping notes, or the founder has switched that off. The notes are shown either way, so they can still be read and deleted.
  keeping: boolean
}

// Droplet's notes on the project: for each workspace, what it keeps (a digest, about 800 characters, and an index of every note, colour or line, word for
// word), to read, change, write again and delete. Nothing here is a decision: it is what the workspaces held when they were last saved.
export default function BriefNotes({ projectId, projectName, keeping }: Props) {
  const [notes, setNotes] = useState<NotesDoc | null>(null)
  const headingId = useId()
  const reload = useCallback(async () => setNotes(await loadNotes(projectId)), [projectId])
  useEffect(() => {
    let current = true
    void loadNotes(projectId).then((loaded) => current && setNotes(loaded))
    return () => {
      current = false
    }
  }, [projectId])

  const write = async (next: NotesDoc) => {
    if (await saveNotes(projectId, next)) setNotes(next)
  }

  return (
    <section className="brief__section" aria-labelledby={headingId}>
      <h3 className="brief__heading" id={headingId}>
        Droplet&rsquo;s notes on this project
      </h3>
      {!keeping && <p className="brief__empty">Droplet is not keeping notes. These are kept until you delete them.</p>}
      {notes === null ? (
        <p className="brief__empty">Reading the notes…</p>
      ) : (
        <ul className="brief__list">
          {NOTE_WORKSPACES.map((workspace) => (
            <WorkspaceRow
              key={workspace}
              workspace={workspace}
              notes={notes}
              onEdit={(text) => {
                const current = notes[workspace]
                if (current) void write({ ...notes, [workspace]: { ...current, digest: { text, builtAt: new Date().toISOString(), basedOn: fingerprint(current.index), edited: true }, outOfDate: undefined } })
              }}
              onRebuild={async () => {
                // From what is saved now, and asked for whether or not one is due.
                await updateIndex(projectId, workspace)
                await writeDigest(projectId, projectName, workspace, { force: true })
                await reload()
              }}
              onDelete={() => {
                const { [workspace]: _gone, ...rest } = notes
                void write(rest)
              }}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function WorkspaceRow({ workspace, notes, onEdit, onRebuild, onDelete }: { workspace: NotesWorkspace; notes: NotesDoc; onEdit: (text: string) => void; onRebuild: () => Promise<void>; onDelete: () => void }) {
  const mine = notes[workspace]
  const [mode, setMode] = useState<'read' | 'edit' | 'delete'>('read')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const title = NOTES_TITLES[workspace]

  return (
    <li className="notes">
      <div className="notes__head">
        <span className="notes__title">{title}</span>
        {mine && (
          <span className="notes__when">
            {mine.index.length} kept · saved {whenLabel(mine.indexedAt)}
            {mine.digest?.edited ? ' · digest written by you' : ''}
            {mine.outOfDate ? ' · digest is behind' : ''}
          </span>
        )}
      </div>
      {!mine ? (
        <p className="brief__empty">Nothing yet. Droplet takes notes when you save {workspace === 'board' ? 'the board' : workspace === 'brand' ? 'the palette' : 'an invoice'}.</p>
      ) : mode === 'edit' ? (
        <div className="notes__edit">
          <label>
            <span>Digest of {title.toLowerCase()}</span>
            <textarea className="brief__input notes__area" rows={6} maxLength={MAX_DIGEST_CHARS} value={draft} onChange={(event) => setDraft(event.target.value)} />
          </label>
          <span className="brief__actions">
            <button
              type="button"
              className="brief__small brief__small--primary"
              disabled={draft.trim() === ''}
              onClick={() => {
                onEdit(draft.trim())
                setMode('read')
              }}
            >
              Save
            </button>
            <button type="button" className="brief__small" onClick={() => setMode('read')}>
              Cancel
            </button>
          </span>
        </div>
      ) : (
        <>
          {mine.digest ? <p className="notes__digest">{mine.digest.text}</p> : <p className="brief__empty">No digest yet. It is written in the background after a save.</p>}
          <details className="notes__index">
            <summary>Everything kept ({mine.index.length})</summary>
            <pre>{printNotes(mine)}</pre>
          </details>
        </>
      )}
      {mine && mode === 'read' && (
        <span className="brief__actions">
          <button
            type="button"
            className="brief__icon"
            aria-label={`Edit the digest of ${title.toLowerCase()}`}
            onClick={() => {
              setDraft(mine.digest?.text ?? '')
              setMode('edit')
            }}
          >
            <PenIcon size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="brief__icon"
            aria-label={`Rebuild the notes on ${title.toLowerCase()}`}
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onRebuild().finally(() => setBusy(false))
            }}
          >
            <RefreshIcon size={16} aria-hidden="true" />
          </button>
          <button type="button" className="brief__icon" aria-label={`Delete the notes on ${title.toLowerCase()}`} onClick={() => setMode('delete')}>
            <TrashBinMinimalisticIcon size={16} aria-hidden="true" />
          </button>
        </span>
      )}
      {mode === 'delete' && (
        <span className="brief__ask">
          <span>Delete these notes? {workspace === 'board' ? 'The board stays.' : workspace === 'brand' ? 'The palette stays.' : 'The invoices stay.'}</span>
          <button
            type="button"
            className="brief__small brief__small--danger"
            onClick={() => {
              onDelete()
              setMode('read')
            }}
          >
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
