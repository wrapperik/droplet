import { z } from 'zod'
import { MAX_DIGEST_CHARS, MAX_DIGEST_ITEMS, NOTE_WORKSPACES, type DigestItem, type DigestRequest, type NotesWorkspace } from '../compose/digest.ts'
import { frameOf } from './boardFrames.ts'
import { isNode, type BoardItem } from './boardTypes.ts'
import { computeTotals } from './invoice.ts'
import { formatRand } from './money.ts'
import type { ProjectMemory } from './memorySave.ts'
import type { PaletteBlock } from './palette.ts'
import { wordsOf } from './recall.ts'

// Droplet's notebook on a project: so that a week after a brainstorm, Droplet still has the one good idea on the board.
//
// It has two parts for each workspace. The index is every thing in the workspace, word for word, kept up to date on every save by code alone (no model
// is asked). The digest is a short account of the workspace, about 800 characters, written in the background by Quick after a save: what it is
// about, what is decided, what is open, and the ideas worth coming back to, each one copied word for word by code from the index. Starred things are
// always in the digest. A note is an idea and not a decision: nothing in the notebook is remembered as a fact until the founder says so.

export { NOTE_WORKSPACES, type NotesWorkspace }

export const MAX_INDEX_LINES = 200
export const MAX_LINE_TEXT = 200
export const DIGEST_EVERY_MS = 5 * 60 * 1000

const lineSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().min(1).max(240),
  where: z.string().max(80).optional(),
  by: z.enum(['you', 'ai']).optional(),
  starred: z.boolean().optional(),
  // When it was added, or its words last changed.
  at: z.string().max(40),
})
export type IndexLine = z.infer<typeof lineSchema>

const digestSavedSchema = z.object({
  text: z.string().min(1).max(MAX_DIGEST_CHARS + 10),
  builtAt: z.string().max(40),
  // The index it was written from, so a digest is only written again when the index has changed.
  basedOn: z.string().max(20),
  // The founder wrote it, so it is not written over by itself.
  edited: z.boolean().optional(),
})
export type SavedDigest = z.infer<typeof digestSavedSchema>

const workspaceNotesSchema = z.object({
  index: z.array(lineSchema).max(MAX_INDEX_LINES),
  indexedAt: z.string().max(40),
  digest: digestSavedSchema.nullable(),
  // A digest could not be written, so what is kept is behind; it is tried again on the next save.
  outOfDate: z.boolean().optional(),
})
export type WorkspaceNotes = z.infer<typeof workspaceNotesSchema>

// About 200 KB at most: three workspaces of 200 lines of 400 characters or fewer.
export const notesSchema = z.object({
  board: workspaceNotesSchema.optional(),
  brand: workspaceNotesSchema.optional(),
  invoice: workspaceNotesSchema.optional(),
})
export type NotesDoc = z.infer<typeof notesSchema>

export const emptyNotes = (): NotesDoc => ({})

// ---- The index ----

const tidy = (text: string, max = MAX_LINE_TEXT) => text.replace(/\s+/g, ' ').trim().slice(0, max)

// A short, stable fingerprint of what is indexed (the words and the stars, not the dates), to tell whether a digest is out of date.
export function fingerprint(lines: IndexLine[]): string {
  let hash = 5381
  for (const char of lines.map((line) => `${line.id}|${line.text}|${line.where ?? ''}|${line.starred ? 1 : 0}`).join('\n')) hash = ((hash << 5) + hash + char.charCodeAt(0)) | 0
  return (hash >>> 0).toString(36)
}

// The lines kept, if there are too many: those starred first, then the newest.
function kept(lines: IndexLine[]): IndexLine[] {
  if (lines.length <= MAX_INDEX_LINES) return lines
  const rank = (line: IndexLine) => (line.starred ? '9' : '0') + line.at
  const chosen = new Set([...lines].sort((a, b) => rank(b).localeCompare(rank(a))).slice(0, MAX_INDEX_LINES).map((line) => line.id))
  return lines.filter((line) => chosen.has(line.id))
}

// A line keeps the date it was added until its words change.
const dated = (id: string, text: string, previous: IndexLine[] | undefined, now: string) => {
  const before = previous?.find((line) => line.id === id)
  return before && before.text === text ? before.at : now
}

export function indexBoard(items: BoardItem[], previous: IndexLine[] | undefined, now: string): IndexLine[] {
  const lines: IndexLine[] = []
  for (const item of items) {
    if (!isNode(item)) continue
    const text = tidy(item.text)
    // A prompt nobody has written in is not an idea.
    if (text === '') continue
    const frame = frameOf(items, item)
    const where = frame ? tidy(frame.title, 80) : ''
    lines.push({ id: item.id, text, ...(where ? { where } : {}), ...(item.kind === 'note' && item.author === 'ai' ? { by: 'ai' as const } : {}), ...(item.starred ? { starred: true } : {}), at: dated(item.id, text, previous, now) })
  }
  return kept(lines)
}

export function indexPalette(blocks: PaletteBlock[], previous: IndexLine[] | undefined, now: string): IndexLine[] {
  return blocks.map((block) => {
    const text = tidy(`${block.hex}${block.name ? ` ${block.name}` : ''}${block.role ? ` (${block.role})` : ''}`)
    return { id: String(block.id), text, ...(block.starred ? { starred: true } : {}), at: dated(String(block.id), text, previous, now) }
  })
}

// The saved invoices: the number, the client's name, each line and the total. Never a client's address, contact or bank detail, nor the business's: the
// index is built only from these parts, and a test checks none of the others get in.
export function indexInvoices(invoices: ProjectMemory['invoices'], previous: IndexLine[] | undefined): IndexLine[] {
  const lines: IndexLine[] = []
  for (const invoice of invoices) {
    const { content } = invoice
    const number = tidy(content.details.number, 40) || 'An invoice'
    const client = tidy(content.client.name, 80)
    const totals = computeTotals(content.lines, content.vatRegistered)
    const status = invoice.exportedAt ? (invoice.updatedAt > invoice.exportedAt ? 'changed since it was exported' : 'exported') : 'not exported yet'
    const headline = tidy(`${number} for ${client || 'no client yet'}: ${formatRand(totals.totalCents)}, ${status}`)
    lines.push({ id: `i:${invoice.id}`, text: headline, at: dated(`i:${invoice.id}`, headline, previous, invoice.updatedAt) })
    for (const line of content.lines) {
      if (line.description.trim() === '') continue
      const price = line.unitCents === null ? 'no price yet' : `${formatRand(line.unitCents)} each`
      const text = tidy(`${line.quantity} × ${line.description}, ${price}`)
      lines.push({ id: `l:${invoice.id}:${line.id}`, text, where: number, ...(line.starred ? { starred: true } : {}), at: dated(`l:${invoice.id}:${line.id}`, text, previous, invoice.updatedAt) })
    }
  }
  return kept(lines)
}

// ---- The digest ----

// Whether a workspace is due a new digest: its index has changed since the last one, and the last was not written in the last five minutes. A digest
// the founder wrote is not written over, and a workspace with nothing indexed has nothing to digest. A digest that failed is due on the next save,
// whenever that is.
export function digestDue(notes: WorkspaceNotes | undefined, now: number): boolean {
  if (!notes || notes.index.length === 0) return false
  if (!notes.digest) return true
  if (notes.digest.edited) return false
  if (notes.digest.basedOn === fingerprint(notes.index)) return false
  if (notes.outOfDate) return true
  return now - Date.parse(notes.digest.builtAt) >= DIGEST_EVERY_MS
}

// The request to write a digest: the starred things first, then the newest, up to what a request holds, each with a short reference.
export function digestRequestFor(workspace: NotesWorkspace, projectName: string, index: IndexLine[]): { request: DigestRequest; items: DigestItem[] } {
  const chosen = [...index].sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || b.at.localeCompare(a.at)).slice(0, MAX_DIGEST_ITEMS)
  const items: DigestItem[] = chosen.map((line, position) => ({ ref: `r${position + 1}`, text: line.text, ...(line.where ? { where: line.where } : {}), ...(line.by ? { by: line.by } : {}), ...(line.starred ? { starred: true } : {}) }))
  return { request: { kind: 'digest_workspace', workspace, ...(projectName.trim() ? { projectName: projectName.trim().slice(0, 80) } : {}), items }, items }
}

// ---- Use ----

export const MAX_DIGESTS_CHARS = 2500
export const MAX_FOUND_CHARS = 1000
// What the request schema takes for the lines found: at most 40, each up to 300 characters.
export const MAX_FOUND_LINES = 40
export const MAX_FOUND_LINE_CHARS = 300

export type NotesForRequest = {
  digests: { workspace: NotesWorkspace; text: string }[]
  found: { workspace: NotesWorkspace; text: string; at: string }[]
}

// Lines whose words match words of the request, best match first, and the newest of those. The workspace on screen is left out, since it is in front of
// Droplet in full.
export function findInNotes(doc: NotesDoc, words: Set<string>, leaveOut?: NotesWorkspace, maxChars = MAX_FOUND_CHARS): NotesForRequest['found'] {
  if (words.size === 0) return []
  const hits: { workspace: NotesWorkspace; line: IndexLine; score: number }[] = []
  for (const workspace of NOTE_WORKSPACES) {
    if (workspace === leaveOut) continue
    for (const line of doc[workspace]?.index ?? []) {
      const lineWords = wordsOf(`${line.text} ${line.where ?? ''}`)
      const score = [...words].filter((word) => lineWords.has(word)).length
      if (score > 0) hits.push({ workspace, line, score })
    }
  }
  hits.sort((a, b) => b.score - a.score || Number(Boolean(b.line.starred)) - Number(Boolean(a.line.starred)) || b.line.at.localeCompare(a.line.at))
  const found: NotesForRequest['found'] = []
  let used = 0
  for (const { workspace, line } of hits) {
    if (found.length >= MAX_FOUND_LINES) break
    const text = `${line.where ? `[${line.where}] ` : ''}${line.text}${line.starred ? ' (kept in mind)' : ''}`.slice(0, MAX_FOUND_LINE_CHARS)
    if (used + text.length > maxChars) break
    found.push({ workspace, text, at: line.at.slice(0, 10) })
    used += text.length
  }
  return found
}

// What goes with a message: the digests of the workspaces that are not on screen, in about 2,500 characters, and, if the request has words the digests do
// not cover, the lines of the index that match them, in about 1,000. Nothing at all when there is nothing.
export function notesForRequest(doc: NotesDoc, options: { onScreen?: NotesWorkspace; intent: string }): NotesForRequest | null {
  const digests: NotesForRequest['digests'] = []
  let used = 0
  for (const workspace of NOTE_WORKSPACES) {
    const text = doc[workspace]?.digest?.text
    if (workspace === options.onScreen || !text) continue
    const room = MAX_DIGESTS_CHARS - used
    if (room < 80) break
    digests.push({ workspace, text: text.slice(0, room) })
    used += Math.min(text.length, room)
  }
  const covered = wordsOf(digests.map((entry) => entry.text).join(' '))
  const uncovered = new Set([...wordsOf(options.intent)].filter((word) => !covered.has(word)))
  const found = findInNotes(doc, uncovered, options.onScreen)
  return digests.length === 0 && found.length === 0 ? null : { digests, found }
}

// The notes as text, to read in the brief.
export const printNotes = (notes: WorkspaceNotes): string => notes.index.map((line) => `${line.where ? `[${line.where}] ` : ''}${line.text}${line.starred ? ' (kept in mind)' : ''}`).join('\n')
