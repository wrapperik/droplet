import { assembleDigest } from '../compose/digest.ts'
import type { NotesWorkspace } from '../compose/digest.ts'
import { loadBoard } from './boardStore.ts'
import { requestDigest } from './composeClient.ts'
import { loadMemory } from './memoryStore.ts'
import { digestDue, digestRequestFor, fingerprint, indexBoard, indexInvoices, indexPalette, type IndexLine, type WorkspaceNotes } from './notes.ts'
import { loadNotes, saveNotes } from './notesStore.ts'
import { settingOn } from './projectMemory.ts'
import { loadPalette } from './projectStore.ts'
import type { DocKind } from './storage.ts'

// Keeps Droplet's notes on a project up to date. Told after something is saved: the index of that workspace is brought up to date at once, by code
// alone; then, without holding anything up, a digest is asked for from Quick if the index has changed and the last digest is not from the last five
// minutes. Nothing is done when the founder has switched the notes off. A digest that fails leaves the old one in place, marked out of date, and is
// tried again on the next save.

// The workspace a saved document belongs to. The memory holds the invoices.
export const WORKSPACE_OF: Partial<Record<DocKind, NotesWorkspace>> = { board: 'board', palette: 'brand', memory: 'invoice' }

// One digest at a time for a workspace of a project, so two quick saves ask once.
const writing = new Set<string>()

// One notebook is changed at a time for a project, so two saves in a row do not write over each other's lines.
const queues = new Map<string, Promise<unknown>>()
function inTurn<T>(projectId: string, task: () => Promise<T>): Promise<T> {
  const next = (queues.get(projectId) ?? Promise.resolve()).then(task, task)
  queues.set(projectId, next.catch(() => undefined))
  return next
}

async function indexNow(projectId: string, workspace: NotesWorkspace, previous: IndexLine[] | undefined, now: string): Promise<IndexLine[] | null> {
  if (workspace === 'board') return indexBoard((await loadBoard(projectId))?.items ?? [], previous, now)
  if (workspace === 'brand') return indexPalette((await loadPalette(projectId))?.blocks ?? [], previous, now)
  return indexInvoices((await loadMemory(projectId)).invoices, previous)
}

// Brings the index of a workspace up to date. Returns the notes of the workspace as they are now, or null if the founder has switched notes off.
export function updateIndex(projectId: string, workspace: NotesWorkspace, now: string = new Date().toISOString()): Promise<WorkspaceNotes | null> {
  return inTurn(projectId, async () => {
    if (!settingOn(await loadMemory(projectId), 'notes')) return null
    const doc = await loadNotes(projectId)
    const before = doc[workspace]
    const index = await indexNow(projectId, workspace, before?.index, now)
    if (!index) return null
    if (before && fingerprint(before.index) === fingerprint(index) && JSON.stringify(before.index) === JSON.stringify(index)) return before
    const next: WorkspaceNotes = { index, indexedAt: now, digest: before?.digest ?? null, ...(before?.outOfDate ? { outOfDate: true } : {}) }
    await saveNotes(projectId, { ...doc, [workspace]: next })
    return next
  })
}

// Writes the digest of a workspace, if one is due (or `force`, for Rebuild). Returns true if a new one was kept.
export async function writeDigest(projectId: string, projectName: string, workspace: NotesWorkspace, options: { force?: boolean; now?: () => number } = {}): Promise<boolean> {
  const now = options.now ?? Date.now
  const key = `${projectId}:${workspace}`
  if (writing.has(key)) return false
  // Marked before anything is read, so two saves close together ask once.
  writing.add(key)
  try {
    const notes = (await loadNotes(projectId))[workspace]
    if (!notes || notes.index.length === 0) return false
    if (!options.force && !digestDue(notes, now())) return false
    const { request, items } = digestRequestFor(workspace, projectName, notes.index)
    const result = await requestDigest(request)
    return await inTurn(projectId, async () => {
      const doc = await loadNotes(projectId)
      const current = doc[workspace]
      if (!current) return false
      // A failure leaves what is kept, behind, and says so. A digest that could not be trusted is the same as no digest.
      if (!result.ok || !result.digest) {
        await saveNotes(projectId, { ...doc, [workspace]: { ...current, outOfDate: true } })
        return false
      }
      const { text } = assembleDigest(result.digest, items)
      const next: WorkspaceNotes = { index: current.index, indexedAt: current.indexedAt, digest: { text, builtAt: new Date(now()).toISOString(), basedOn: fingerprint(notes.index) } }
      await saveNotes(projectId, { ...doc, [workspace]: next })
      return true
    })
  } finally {
    writing.delete(key)
  }
}

// What happens after a save: the index at once, then the digest in the background.
export async function keepNotes(projectId: string, projectName: string, kind: DocKind): Promise<void> {
  const workspace = WORKSPACE_OF[kind]
  if (!workspace) return
  const notes = await updateIndex(projectId, workspace)
  if (!notes) return
  await writeDigest(projectId, projectName, workspace)
}
