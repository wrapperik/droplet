import { clamp, type Point } from '../lib/boardGeometry.ts'
import { frameOf, membersOf } from '../lib/boardFrames.ts'
import { docOf, openBoard, type BoardState } from '../lib/boardState.ts'
import { TEMPLATE_IDS, promptsOf, templateById, templateOfGroup } from '../lib/boardTemplates.ts'
import { createHistory } from '../lib/history.ts'
import { attachedTo, isConnector, isFrame, isNode, type BoardItem, type ConnectorItem, type End } from '../lib/boardTypes.ts'
import { MAX_SNAPSHOT_ITEMS, type BoardItemSnapshot, type BoardSnapshot } from './boardSpec.ts'

// The board as a plain object: what goes to the model with a request, and what the server rebuilds to check the model's actions against.
//
// Each thing is given a short reference (f1 for a frame, n3 for a note, s1 a shape, t1 text, a2 an arrow) counting from 1 in the order they are
// drawn, and the model names things by those. The references are worked out here, the same way on both sides, so a reply means the same on the
// server as in the browser.

const PREFIX: Record<BoardItem['kind'], string> = { frame: 'f', connector: 'a', note: 'n', shape: 's', text: 't' }
const WORDS_LENGTH = 160

// The reference of every thing on the board, by id.
export function refsOf(items: BoardItem[]): Map<string, string> {
  const counts: Record<string, number> = {}
  const refs = new Map<string, string>()
  for (const item of items) {
    const prefix = PREFIX[item.kind]
    counts[prefix] = (counts[prefix] ?? 0) + 1
    refs.set(item.id, `${prefix}${counts[prefix]}`)
  }
  return refs
}

const cut = (text: string) => text.slice(0, WORDS_LENGTH)
const templateIdOf = (item: BoardItem) => (item.group ? templateOfGroup(item.group)?.id : undefined)

// What the model is shown of a board. Only what a request needs: the words and shape of what is on it, and nothing about the founder beyond it.
// A board with more than `MAX_SNAPSHOT_ITEMS` things shows its frames, what is selected and then the rest in the order they are drawn, and says
// how many are not shown.
export function snapshotOfBoard(state: BoardState, view: Point, saved: BoardSnapshot['saved']): BoardSnapshot {
  const doc = docOf(state)
  const refs = refsOf(doc.items)
  const shown = new Set<string>()
  const add = (item: BoardItem) => {
    if (shown.size < MAX_SNAPSHOT_ITEMS) shown.add(item.id)
  }
  doc.items.filter(isFrame).forEach(add)
  doc.items.filter((item) => state.selection.includes(item.id)).forEach(add)
  doc.items.forEach(add)

  const end = (e: End): string | null => {
    const id = attachedTo(e)
    return id && shown.has(id) ? (refs.get(id) ?? null) : null
  }

  const items = doc.items.filter((item) => shown.has(item.id)).map((item): BoardItemSnapshot => {
    const ref = refs.get(item.id)!
    const template = templateIdOf(item)
    const common = { ref, ...(template ? { template } : {}) }
    switch (item.kind) {
      case 'note':
        return { ...common, kind: 'note', x: item.x, y: item.y, w: item.w, h: item.h, text: cut(item.text), colour: item.colour, author: item.author, ...(item.hint ? { hint: item.hint } : {}) }
      case 'shape':
        return { ...common, kind: 'shape', x: item.x, y: item.y, w: item.w, h: item.h, shape: item.shape, text: cut(item.text), colour: item.colour, ...(item.hint ? { hint: item.hint } : {}) }
      case 'text':
        return { ...common, kind: 'text', x: item.x, y: item.y, w: item.w, h: item.h, size: item.size, text: cut(item.text), ...(item.hint ? { hint: item.hint } : {}) }
      case 'frame':
        return { ...common, kind: 'frame', x: item.x, y: item.y, w: item.w, h: item.h, title: cut(item.title), colour: item.colour }
      case 'connector':
        return { ...common, kind: 'connector', from: end(item.from), to: end(item.to), style: item.style, head: item.head, text: item.text }
    }
  })

  return {
    items,
    more: doc.items.length - items.length,
    view: { x: Math.round(clamp(view.x, 0, 4800)), y: Math.round(clamp(view.y, 0, 3200)) },
    selection: state.selection.filter((id) => shown.has(id)).map((id) => refs.get(id)!),
    summary: doc.summary ? { decided: doc.summary.decided, open: doc.summary.open, next: doc.summary.next, by: doc.summary.by, edited: doc.summary.edited } : null,
    canUndo: state.history.past.length > 0,
    canRedo: state.history.future.length > 0,
    saved,
  }
}

// A board that looks like the one the snapshot was taken of, as far as the actions can tell: the things shown, with their references as their
// ids, so that an action naming n3 means the third note here as it did on the screen. The history is only as deep as it needs to be for undo
// and redo to be allowed or refused as they were.
export function stateOfBoardSnapshot(snapshot: BoardSnapshot): BoardState {
  const items: BoardItem[] = snapshot.items.map((item) => {
    const group = 'template' in item && item.template ? `${item.template}:snapshot` : undefined
    const common = { id: item.ref, ...(group ? { group } : {}) }
    switch (item.kind) {
      case 'note':
        return { ...common, kind: 'note', x: item.x, y: item.y, w: item.w, h: item.h, text: item.text, colour: item.colour, author: item.author, ...(item.hint ? { hint: item.hint } : {}) }
      case 'shape':
        return { ...common, kind: 'shape', shape: item.shape, x: item.x, y: item.y, w: item.w, h: item.h, text: item.text, colour: item.colour, ...(item.hint ? { hint: item.hint } : {}) }
      case 'text':
        return { ...common, kind: 'text', size: item.size, x: item.x, y: item.y, w: item.w, h: item.h, text: item.text, ...(item.hint ? { hint: item.hint } : {}) }
      case 'frame':
        return { ...common, kind: 'frame', x: item.x, y: item.y, w: item.w, h: item.h, title: item.title, colour: item.colour }
      case 'connector': {
        const point = (ref: string | null): End => (ref ? { item: ref } : { x: 0, y: 0 })
        const arrow: ConnectorItem = { ...common, kind: 'connector', from: point(item.from), to: point(item.to), style: item.style, head: item.head, text: item.text }
        return arrow
      }
    }
  })
  const state = openBoard(items, null, snapshot.summary ? { ...snapshot.summary, writtenAt: '' } : null)
  const doc = docOf(state)
  const history = createHistory(doc)
  return { ...state, selection: snapshot.selection.filter((ref) => doc.items.some((item) => item.id === ref)), history: { ...history, past: snapshot.canUndo ? [doc] : [], future: snapshot.canRedo ? [doc] : [] } }
}

// ---- What the model reads ----

const plain = (text: string) => text.replace(/\s+/g, ' ').trim()

// The board in words the model can reason with. Where each thing is on the board is left out (it is the app's to decide), and what is
// worth knowing is made plain: which frame holds what, which notes are the founder's and which are Droplet's, and which prompts are empty.
export function describeBoard(snapshot: BoardSnapshot): Record<string, unknown> {
  const state = stateOfBoardSnapshot(snapshot)
  const items = docOf(state).items
  const byRef = new Map(items.map((item) => [item.id, item]))
  const wordsOf = (item: BoardItem) => (isFrame(item) ? item.title : 'text' in item ? item.text : '')
  const holder = (ref: string) => {
    const item = byRef.get(ref)
    const frame = item && isNode(item) ? frameOf(items, item) : null
    return frame ? frame.id : null
  }
  const selected = new Set(snapshot.selection)
  const templateOfRef = new Map(snapshot.items.flatMap((item) => ('template' in item && item.template ? [[item.ref, item.template] as const] : [])))

  return {
    frames: items.filter(isFrame).map((frame) => ({
      ref: frame.id,
      title: plain(frame.title) || 'untitled',
      template: templateOfRef.get(frame.id),
      holds: membersOf(items, frame).map((member) => member.id),
      selected: selected.has(frame.id) || undefined,
    })),
    things: items.filter(isNode).map((item) => ({
      ref: item.id,
      kind: item.kind === 'shape' ? `${item.shape} shape` : item.kind,
      text: plain(wordsOf(item)) || 'empty',
      by: item.kind === 'note' ? (item.author === 'ai' ? 'Droplet' : 'the founder') : 'the founder',
      inFrame: holder(item.id) ?? undefined,
      selected: selected.has(item.id) || undefined,
    })),
    arrows: items.filter(isConnector).map((arrow) => ({
      ref: arrow.id,
      from: 'item' in arrow.from ? arrow.from.item : 'nothing',
      to: 'item' in arrow.to ? arrow.to.item : 'nothing',
      label: arrow.text || undefined,
    })),
    // The notes with nothing written in them, mostly the prompts of a template, which can be filled in.
    emptyPrompts: items
      .filter((item) => item.kind === 'note' && item.text.trim() === '')
      .map((item) => ({ ref: item.id, hint: 'hint' in item ? item.hint : undefined, inFrame: holder(item.id) ?? undefined })),
    selected: snapshot.selection,
    summary: snapshot.summary
      ? { writtenBy: snapshot.summary.by === 'droplet' ? 'Droplet' : 'the founder', editedByTheFounder: snapshot.summary.edited || undefined, decided: snapshot.summary.decided, stillOpen: snapshot.summary.open, next: snapshot.summary.next }
      : 'none yet',
    notShown: snapshot.more > 0 ? `${snapshot.more} more things are on the board that are not shown here, so you cannot refer to them.` : undefined,
    canUndo: snapshot.canUndo,
    canRedo: snapshot.canRedo,
    saved: snapshot.saved,
  }
}

// The prompts of each template in the order a fill is given in, so the model can write for them. Made from the templates themselves, so it
// cannot say something else.
export function describeTemplates(): string {
  return TEMPLATE_IDS.map((id) => {
    const template = templateById(id)!
    const prompts = promptsOf(template).map((note, index) => `${index + 1}. ${note.hint}`)
    return `- ${id} (${template.name}: ${template.summary}) has ${prompts.length} prompts, in this order: ${prompts.join(' ')}`
  }).join('\n')
}

