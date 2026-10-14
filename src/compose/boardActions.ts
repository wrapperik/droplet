import { BOARD, GRID, intersects, type Point } from '../lib/boardGeometry.ts'
import { membersOf } from '../lib/boardFrames.ts'
import { AI_NOTE, layoutCluster, middleOf, placeCluster, roomInFrame, slotInFrame, spotLoose, spotNear } from '../lib/boardPlacement.ts'
import { canRedoBoard, canUndoBoard, docOf, reduceBoard, type BoardAction, type BoardState } from '../lib/boardState.ts'
import { groupFor, instantiateTemplate, placeTemplate, promptsOf, templateById } from '../lib/boardTemplates.ts'
import { attachedTo, describeItem, isConnector, isFrame, isNode, isRectItem, MAX_ITEMS, rectOf, SHAPE_COLOURS, FOUNDER_COLOURS, type BoardItem, type FrameItem, type NodeItem, type RectItem } from '../lib/boardTypes.ts'
import { newId as freshId } from '../lib/ids.ts'
import { refsOf } from './boardSnapshot.ts'
import { plural, type Change, type FocusTarget } from './receipt.ts'
import { MAX_AI_ARROWS, MAX_AI_CLUSTERS, MAX_AI_NOTES, MAX_AI_SUMMARY_LINES, type BoardTurnAction } from './boardSpec.ts'

// Turns the model's actions on the board into board actions and applies them through the same reducer a person's edits use. Anything that
// cannot be done is left out with a plain reason, and the reasons are what goes back to the model if it has to try again. A turn is one step in
// the history, so one Undo takes back everything the model did.
//
// What is done here is also what keeps the model in its place. It names things by their references and never gives a position, a size or a
// colour of its own choosing: the places come from `boardPlacement`, and a note by Droplet is pink with its name on it, whatever the model said.
// It may add, move, tidy and arrange. It may recolour only on the founder's own words (a quote, checked). It may change or delete its own notes at
// once, but a change to the founder's, or deleting them, is only ever a proposal: it comes back as `pending`, and the interface asks the founder in
// the chat. It cannot write over a note that has words in it with fill_prompt.

// Words compared the way a person would: capitals, curly quotes, punctuation and spacing do not matter.
const plainWords = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim()

// Words that make a quote a request for a colour.
const COLOUR_WORDS = /\b(colou?rs?|recolou?r|paint|shade|tint|yellow|mint|green|sky|blue|lilac|purple|peach|orange|grey|gray|white)\b/i

export type BoardSkipped = { position: number; action: BoardTurnAction; reason: string }

type Props = {
  base: BoardState
  actions: BoardTurnAction[]
  // The middle of what the founder is looking at, where things with no place of their own go.
  view: Point
  // Makes the id of a new thing. Given so that the server's check and a test need not make random ones.
  newId?: () => string
  // What the founder has written in this conversation, for the quote that must back a recolour. Without it, nothing is recoloured.
  founderText?: string
}

// A change to the founder's own work that Droplet proposed and the app will not make until the founder says yes, in the chat. Nothing in the
// board has changed when one is returned.
export type PendingBoardEdit =
  | { kind: 'remove'; ids: string[]; refs: string[]; prompt: string }
  | { kind: 'edit'; id: string; ref: string; what: 'note' | 'frame'; from: string; to: string; prompt: string }

// `changes` is what was done, for the change receipt: notes added to the same place are one line, and so are arrows and filled prompts.
export type BoardApplyResult = { state: BoardState; skipped: BoardSkipped[]; changes: Change[]; pending: PendingBoardEdit[] }

export function applyBoardTurnActions({ base, actions, view, newId = freshId, founderText = '' }: Props): BoardApplyResult {
  const skipped: BoardSkipped[] = []
  const pending: PendingBoardEdit[] = []

  // Undo and redo take back or restore a whole step, so they stand alone.
  const history = actions.find((action) => action.type === 'undo' || action.type === 'redo')
  if (history) {
    const position = actions.indexOf(history)
    const reason =
      actions.length > 1 ? 'Undo and redo cannot be combined with other actions. Send them on their own.'
      : history.type === 'undo' && !canUndoBoard(base) ? 'There is nothing to undo.'
      : history.type === 'redo' && !canRedoBoard(base) ? 'There is nothing to redo.'
      : null
    if (reason) return { state: base, skipped: [{ position, action: history, reason }], changes: [], pending }
    return { state: reduceBoard(base, { type: history.type }), skipped, changes: [{ kind: 'changed', text: history.type === 'undo' ? 'Took back the last change' : 'Put back the change that was taken back', focus: [] }], pending }
  }

  // The references mean what they meant when the board was shown, all the way through the turn, even after things are moved.
  const idOf = new Map([...refsOf(docOf(base).items)].map(([id, ref]) => [ref, id]))
  let scratch = base
  const collected: BoardAction[] = []
  const used = { notes: 0, clusters: 0, templates: 0, arrows: 0, summaries: 0, arranges: 0 }
  const clustered = new Set<string>()
  // What was done, in the order it was done. Notes put in the same place, arrows and filled prompts are counted into one line each.
  const changes: Change[] = []
  const tally = new Map<string, { count: number; focus: FocusTarget[]; change: Change; text: (count: number) => string }>()
  const count = (key: string, text: (count: number) => string, kind: Change['kind'], target: FocusTarget) => {
    const there = tally.get(key)
    if (there) {
      there.count += 1
      there.focus.push(target)
      there.change.text = text(there.count)
      return
    }
    const change: Change = { kind, text: text(1), focus: [target] }
    tally.set(key, { count: 1, focus: change.focus, change, text })
    changes.push(change)
  }
  const words = (item: BoardItem) => (isFrame(item) ? item.title : item.kind === 'note' || item.kind === 'shape' || item.kind === 'text' ? item.text : '').trim().slice(0, 40) || 'an item'
  const quoted = (text: string) => `\u201c${text}\u201d`

  const items = () => docOf(scratch).items
  const find = (ref: string): BoardItem | undefined => {
    const id = idOf.get(ref)
    return id ? items().find((item) => item.id === id) : undefined
  }
  const known = () => [...idOf.keys()].slice(0, 12).join(', ')
  const missing = (ref: string) => `There is no "${ref}" on the board. The things shown are ${known() || 'none: the board is empty'}${idOf.size > 12 ? ' and more' : ''}.`
  const name = (item: BoardItem) => `${[...idOf].find(([, id]) => id === item.id)?.[0] ?? item.id} ("${describeItem(item, items()).slice(0, 40)}")`

  // Tries steps on the scratch board, and keeps them only if every one of them changed it.
  const run = (steps: BoardAction[]): boolean => {
    let next = scratch
    for (const step of steps) {
      const after = reduceBoard(next, step)
      if (after === next) return false
      next = after
    }
    scratch = next
    collected.push(...steps)
    return true
  }

  const room = (extra: number) => items().length + extra <= MAX_ITEMS

  actions.forEach((action, position) => {
    const skip = (reason: string) => void skipped.push({ position, action, reason })

    switch (action.type) {
      case 'add_note': {
        if (action.in && action.near) return skip('Give in or near, not both.')
        if (action.connect && !action.near) return skip('connect needs near: an arrow is drawn from the thing in near to the new note.')
        if (used.notes >= MAX_AI_NOTES) return skip(`That is more than ${MAX_AI_NOTES} notes in one reply, which is the most. Leave this one out.`)
        const wanted = action.connect ? 2 : 1
        if (!room(wanted)) return skip('The board already holds as many things as it can.')
        const id = newId()

        let rect = null
        let anchor: RectItem | null = null
        let where = 'on the board'
        if (action.in) {
          const target = find(action.in)
          if (!target) return skip(missing(action.in))
          if (!isFrame(target)) return skip(`${name(target)} is not a frame. Use near to put a note beside it, or name a frame with in.`)
          where = `in ${quoted(words(target))}`
          rect = slotInFrame(items(), target)
          if (!rect) return skip(`${name(target)} has no room for another note (${roomInFrame(items(), target)} would fit). Put it near a note instead, or leave it out.`)
        } else if (action.near) {
          const target = find(action.near)
          if (!target) return skip(missing(action.near))
          if (!isRectItem(target)) return skip(`${action.near} is an arrow, which a note cannot be put beside. Name a note, a shape, some text or a frame.`)
          anchor = target
          where = `beside ${quoted(words(target))}`
          rect = spotNear(items(), target)
          if (!rect) return skip(`There is no clear place beside ${name(target)} on the board.`)
        } else {
          rect = spotLoose(items(), view)
          if (!rect) return skip('There is no clear place on the board for another note.')
        }

        const steps: BoardAction[] = [{ type: 'add_note', id, rect: { ...rect, ...AI_NOTE }, text: action.text, author: 'ai' }]
        if (action.connect && anchor) {
          if (used.arrows >= MAX_AI_ARROWS) return skip(`That is more than ${MAX_AI_ARROWS} arrows in one reply, which is the most.`)
          steps.push({ type: 'add_connector', id: newId(), from: { item: anchor.id }, to: { item: id } })
        }
        if (!run(steps)) return skip('That note could not be added.')
        used.notes += 1
        count(`note:${where}`, (n) => `${plural(n, 'note')} ${where}`, 'added', { kind: 'item', id, how: 'added' })
        if (action.connect) {
          used.arrows += 1
          count('arrow', (n) => plural(n, 'arrow'), 'added', { kind: 'item', id: steps[1].type === 'add_connector' ? steps[1].id : id, how: 'added' })
        }
        return
      }

      case 'fill_prompt': {
        if (used.notes >= MAX_AI_NOTES) return skip(`That is more than ${MAX_AI_NOTES} notes in one reply, which is the most.`)
        const target = find(action.note)
        if (!target) return skip(missing(action.note))
        if (target.kind !== 'note') return skip(`${action.note} is not a note. Only an empty note can be filled in.`)
        if (target.text.trim() !== '') return skip(`${name(target)} already has words in it, which are not mine to write over. Use add_note to put a new note beside it.`)
        if (!run([{ type: 'fill_note', id: target.id, text: action.text }])) return skip('That prompt could not be filled in.')
        used.notes += 1
        count('fill', (n) => `Filled in ${plural(n, 'prompt')}`, 'changed', { kind: 'item', id: target.id, how: 'changed' })
        return
      }

      case 'cluster': {
        if (used.clusters >= MAX_AI_CLUSTERS) return skip(`That is more than ${MAX_AI_CLUSTERS} groups in one reply, which is the most.`)
        const moving: RectItem[] = []
        for (const ref of action.notes) {
          const item = find(ref)
          if (!item) return skip(missing(ref))
          if (!isNode(item)) return skip(`${ref} is not a note, a shape or some text, so it cannot be put in a group.`)
          if (clustered.has(item.id) || moving.some((other) => other.id === item.id)) return skip(`${ref} is in more than one group. Put each thing in one group only.`)
          moving.push(item)
        }
        if (!room(1)) return skip('The board already holds as many things as it can.')
        const layout = layoutCluster(moving.map((item) => ({ w: item.w, h: item.h })))
        const near = middleOf(moving) ?? view
        const origin = placeCluster(items(), layout, near, moving.map((item) => item.id))
        if (!origin) return skip('There is no clear space on the board for a new frame that size.')
        // A move that goes nowhere changes nothing, so it is left out rather than counted as a failure.
        const moves = moving
          .map((item, index) => ({ type: 'move' as const, ids: [item.id], dx: origin.x + layout.rects[index].x - item.x, dy: origin.y + layout.rects[index].y - item.y }))
          .filter((step) => step.dx !== 0 || step.dy !== 0)
        const frame: BoardAction = { type: 'add_frame', id: newId(), rect: { ...origin, ...layout.frame }, title: action.title, colour: 'white' }
        if (!run([frame, ...moves])) return skip('Those could not be gathered into a frame.')
        moving.forEach((item) => clustered.add(item.id))
        used.clusters += 1
        const frameId = (frame as Extract<BoardAction, { type: 'add_frame' }>).id
        const what = moving.every((item) => item.kind === 'note') ? 'notes' : 'things'
        changes.push({
          kind: 'added',
          text: `${moving.length} ${what} moved into a new frame ${quoted(action.title)}`,
          focus: [{ kind: 'item', id: frameId, how: 'added' }, ...moving.map((item) => ({ kind: 'item' as const, id: item.id, how: 'moved' as const }))],
        })
        return
      }

      case 'add_template': {
        if (used.templates >= 1) return skip('Only one template can be added in a reply.')
        const template = templateById(action.template)
        if (!template) return skip(`There is no template called "${action.template}".`)
        const prompts = promptsOf(template)
        const fill = action.fill ?? []
        if (fill.length > prompts.length) return skip(`The ${template.name} template has ${prompts.length} prompts, so ${fill.length} words is too many.`)
        if (!room(template.items.length)) return skip('The board does not have room for that many more things.')
        const near = view
        const { origin, clear } = placeTemplate(template, items(), near)
        if (!clear) return skip('There is no clear space on the board for that template. It would land on top of what is there.')
        const made = instantiateTemplate(template, origin, newId, groupFor(template.id, newId()))
        const steps: BoardAction[] = [{ type: 'add_items', items: made }]
        fill.forEach((words, index) => {
          const at = template.items.findIndex((item) => item.id === prompts[index].id)
          steps.push({ type: 'fill_note', id: made[at].id, text: words })
        })
        if (!run(steps)) return skip('That template could not be added.')
        used.templates += 1
        changes.push({
          kind: 'added',
          text: `The ${template.name} template, ${plural(made.length, 'thing')}${fill.length > 0 ? `, with ${plural(fill.length, 'prompt')} filled in` : ''}`,
          focus: made.map((item) => ({ kind: 'item' as const, id: item.id, how: 'added' as const })),
        })
        return
      }

      case 'connect': {
        if (used.arrows >= MAX_AI_ARROWS) return skip(`That is more than ${MAX_AI_ARROWS} arrows in one reply, which is the most.`)
        const from = find(action.from)
        const to = find(action.to)
        if (!from) return skip(missing(action.from))
        if (!to) return skip(missing(action.to))
        if (isConnector(from) || isConnector(to)) return skip('An arrow joins notes, shapes, text or frames, not other arrows.')
        if (from.id === to.id) return skip('An arrow cannot start and end on the same thing.')
        const twin = items().filter(isConnector).some((arrow) => attachedTo(arrow.from) === from.id && attachedTo(arrow.to) === to.id)
        if (twin) return skip(`There is already an arrow from ${action.from} to ${action.to}.`)
        if (!room(1)) return skip('The board already holds as many things as it can.')
        const arrowId = newId()
        if (!run([{ type: 'add_connector', id: arrowId, from: { item: from.id }, to: { item: to.id }, ...(action.label ? { text: action.label } : {}) }])) return skip('That arrow could not be drawn.')
        used.arrows += 1
        count('arrow', (n) => plural(n, 'arrow'), 'added', { kind: 'item', id: arrowId, how: 'added' })
        return
      }


      case 'move_to_frame': {
        const frame = find(action.frame)
        if (!frame) return skip(missing(action.frame))
        if (!isFrame(frame)) return skip(`${name(frame)} is not a frame. Name a frame to move things into.`)
        const moving: NodeItem[] = []
        for (const ref of action.things) {
          const item = find(ref)
          if (!item) return skip(missing(ref))
          if (!isNode(item)) return skip(`${ref} is not a note, a shape or some text, so it cannot be moved into a frame.`)
          if (moving.some((other) => other.id === item.id)) return skip(`${ref} is named twice.`)
          moving.push(item)
        }
        const already = moving.filter((item) => membersOf(items(), frame).some((member) => member.id === item.id))
        if (already.length === moving.length) return skip(`${moving.length === 1 ? 'That is' : 'Those are'} already in ${name(frame)}.`)
        // Each goes in the first clear place in the frame, one after another, with the others that are moving out of the way.
        let spots = items().filter((item) => !moving.some((other) => other.id === item.id))
        const steps: BoardAction[] = []
        for (const item of moving) {
          if (already.includes(item)) continue
          const rect = slotInFrame(spots, frame, { w: item.w, h: item.h })
          if (!rect) return skip(`${name(frame)} has no room for ${item === moving[0] && moving.length === 1 ? 'it' : 'all of them'} (${roomInFrame(items(), frame)} more would fit). Tidy it first, or move fewer.`)
          spots = [...spots, { ...item, x: rect.x, y: rect.y }]
          steps.push({ type: 'move', ids: [item.id], dx: rect.x - item.x, dy: rect.y - item.y })
        }
        if (!run(steps.filter((step) => step.type !== 'move' || step.dx !== 0 || step.dy !== 0))) return skip('Those could not be moved.')
        const moved = moving.filter((item) => !already.includes(item))
        changes.push({ kind: 'changed', text: `${plural(moved.length, 'thing')} moved into ${quoted(words(frame))}`, focus: moved.map((item) => ({ kind: 'item' as const, id: item.id, how: 'moved' as const })) })
        return
      }

      case 'tidy': {
        let targets: FrameItem[]
        if (action.frame) {
          const frame = find(action.frame)
          if (!frame) return skip(missing(action.frame))
          if (!isFrame(frame)) return skip(`${name(frame)} is not a frame. Name a frame to tidy, or leave frame out to tidy every frame.`)
          targets = [frame]
        } else {
          targets = items().filter(isFrame)
        }
        let tidied = 0
        for (const listed of targets) {
          const frame = items().find((item) => item.id === listed.id) as FrameItem | undefined
          if (!frame) continue
          const members = [...membersOf(items(), frame)].sort((a, b) => a.y - b.y || a.x - b.x)
          if (members.length < 2) {
            if (action.frame) return skip(`${name(frame)} holds fewer than two things, so there is nothing to tidy.`)
            continue
          }
          const layout = layoutCluster(members.map((item) => ({ w: item.w, h: item.h })))
          const fitted = { x: frame.x, y: frame.y, w: layout.frame.w, h: layout.frame.h }
          if (fitted.x + fitted.w > BOARD.w || fitted.y + fitted.h > BOARD.h) {
            if (action.frame) return skip(`${name(frame)} would not fit on the board once tidied.`)
            continue
          }
          const others = items().filter(isRectItem).filter((item) => item.id !== frame.id && !members.some((member) => member.id === item.id)).map(rectOf)
          if (others.some((other) => intersects(fitted, other))) {
            if (action.frame) return skip(`There is no room to tidy ${name(frame)}: fitting it round its things would run into other things on the board.`)
            continue
          }
          const steps: BoardAction[] = members
            .map((member, index) => ({ type: 'move' as const, ids: [member.id], dx: frame.x + layout.rects[index].x - member.x, dy: frame.y + layout.rects[index].y - member.y }))
            .filter((step) => step.dx !== 0 || step.dy !== 0)
          if (fitted.w !== frame.w || fitted.h !== frame.h) steps.push({ type: 'resize_item', id: frame.id, w: fitted.w, h: fitted.h })
          if (steps.length === 0) {
            if (action.frame) return skip(`${name(frame)} is already laid out in a grid.`)
            continue
          }
          if (!run(steps)) {
            if (action.frame) return skip(`${name(frame)} could not be tidied.`)
            continue
          }
          tidied += 1
          changes.push({ kind: 'changed', text: `Tidied ${quoted(words(frame))}: ${plural(members.length, 'thing')} in a grid`, focus: [{ kind: 'item', id: frame.id, how: 'moved' }, ...members.map((member) => ({ kind: 'item' as const, id: member.id, how: 'moved' as const }))] })
        }
        if (tidied === 0 && !action.frame) return skip('There is no frame with two or more things that can be tidied.')
        return
      }

      case 'arrange': {
        if (used.arranges >= 1) return skip('Only one arrange can be done in a reply.')
        const frames: FrameItem[] = []
        for (const ref of action.frames) {
          const frame = find(ref)
          if (!frame) return skip(missing(ref))
          if (!isFrame(frame)) return skip(`${name(frame)} is not a frame. Only frames can be arranged.`)
          if (frames.some((other) => other.id === frame.id)) return skip(`${ref} is named twice.`)
          frames.push(frame)
        }
        const gap = GRID * 4
        const origin = { x: Math.min(...frames.map((frame) => frame.x)), y: Math.min(...frames.map((frame) => frame.y)) }
        const columns = action.layout === 'row' ? frames.length : action.layout === 'column' ? 1 : Math.ceil(Math.sqrt(frames.length))
        const widths = Array.from({ length: columns }, (_, column) => Math.max(0, ...frames.filter((_, index) => index % columns === column).map((frame) => frame.w)))
        const rows = Math.ceil(frames.length / columns)
        const heights = Array.from({ length: rows }, (_, row) => Math.max(0, ...frames.filter((_, index) => Math.floor(index / columns) === row).map((frame) => frame.h)))
        const targets = frames.map((frame, index) => ({
          x: origin.x + widths.slice(0, index % columns).reduce((total, width) => total + width + gap, 0),
          y: origin.y + heights.slice(0, Math.floor(index / columns)).reduce((total, height) => total + height + gap, 0),
          w: frame.w,
          h: frame.h,
        }))
        if (targets.some((target) => target.x + target.w > BOARD.w || target.y + target.h > BOARD.h)) return skip('Laid out that way, the frames would not fit on the board. Try a different layout.')
        const moving = new Set(frames.flatMap((frame) => [frame.id, ...membersOf(items(), frame).map((member) => member.id)]))
        const others = items().filter(isRectItem).filter((item) => !moving.has(item.id)).map(rectOf)
        if (targets.some((target) => others.some((other) => intersects(target, other)))) return skip('Laid out that way, the frames would land on other things on the board. Move or tidy those first.')
        const steps: BoardAction[] = frames
          .map((frame, index) => ({ type: 'move' as const, ids: [frame.id], dx: targets[index].x - frame.x, dy: targets[index].y - frame.y }))
          .filter((step) => step.dx !== 0 || step.dy !== 0)
        if (steps.length === 0) return skip('The frames are already laid out that way.')
        // A frame moved onto the place another still holds takes that one's things with it while it passes, so the order matters. Each order is tried on a
        // copy, and one is used only if every frame ends where it should with everything it held.
        const before = new Map(frames.map((frame) => [frame.id, membersOf(items(), frame).map((member) => ({ id: member.id, dx: member.x - frame.x, dy: member.y - frame.y }))]))
        const worksOut = (order: BoardAction[]) => {
          let trial = scratch
          for (const step of order) trial = reduceBoard(trial, step)
          const after = docOf(trial).items
          return frames.every((frame, index) => {
            const now = after.find((item) => item.id === frame.id)
            if (!now || !isFrame(now) || Math.abs(now.x - targets[index].x) > GRID || Math.abs(now.y - targets[index].y) > GRID) return false
            return (before.get(frame.id) ?? []).every((member) => {
              const there = after.find((item) => item.id === member.id)
              return there !== undefined && isRectItem(there) && Math.abs(there.x - now.x - member.dx) <= GRID && Math.abs(there.y - now.y - member.dy) <= GRID
            })
          })
        }
        const order = [steps, [...steps].reverse()].find(worksOut)
        if (!order) return skip('The frames cannot be laid out that way without their things getting mixed up on the way. Tidy them one at a time instead.')
        if (!run(order)) return skip('The frames could not be arranged.')
        used.arranges += 1
        changes.push({ kind: 'changed', text: `${plural(frames.length, 'frame')} arranged in a ${action.layout}`, focus: frames.map((frame) => ({ kind: 'item' as const, id: frame.id, how: 'moved' as const })) })
        return
      }

      case 'remove': {
        const found: BoardItem[] = []
        for (const ref of action.things) {
          const item = find(ref)
          if (!item) return skip(missing(ref))
          if (!found.some((other) => other.id === item.id)) found.push(item)
        }
        const mine = found.filter((item) => item.kind === 'note' && item.author === 'ai')
        const theirs = found.filter((item) => !mine.includes(item))
        if (mine.length > 0) {
          if (!run([{ type: 'delete', ids: mine.map((item) => item.id) }])) return skip('Those could not be deleted.')
          changes.push({ kind: 'removed', text: `${plural(mine.length, 'note')} by Droplet deleted`, focus: mine.map((item) => ({ kind: 'item' as const, id: item.id, how: 'removed' as const })) })
        }
        if (theirs.length > 0) {
          const kinds = theirs.every((item) => item.kind === 'note') ? 'of your notes' : 'of your things'
          const sample = theirs.slice(0, 4).map((item) => quoted(words(item))).join(', ')
          const frames = theirs.filter(isFrame).length
          pending.push({
            kind: 'remove',
            ids: theirs.map((item) => item.id),
            refs: action.things.filter((ref) => theirs.some((item) => item.id === idOf.get(ref))),
            prompt: `Delete ${theirs.length} ${kinds}? ${sample}${theirs.length > 4 ? `, and ${theirs.length - 4} more` : ''}.${frames > 0 ? ' What is inside a frame stays on the board.' : ''} Nothing is deleted until you say yes.`,
          })
        }
        return
      }

      case 'edit_note':
      case 'rename_frame': {
        const ref = action.type === 'edit_note' ? action.note : action.frame
        const target = find(ref)
        if (!target) return skip(missing(ref))
        const to = action.type === 'edit_note' ? action.text : action.title
        if (action.type === 'edit_note') {
          if (!isNode(target)) return skip(`${name(target)} is not a note, a shape or some text.`)
          if (target.text.trim() === '') return skip(`${name(target)} has no words yet. Use fill_prompt to write in a prompt, or add_note.`)
        } else if (!isFrame(target)) {
          return skip(`${name(target)} is not a frame.`)
        }
        const from = isFrame(target) ? target.title : (target as NodeItem).text
        if (from.trim() === to.trim()) return skip(`${name(target)} already says that.`)
        if (target.kind === 'note' && target.author === 'ai') {
          if (!run([{ type: 'set_text', id: target.id, text: to }])) return skip('That could not be changed.')
          changes.push({ kind: 'changed', text: `A note by Droplet reworded: ${quoted(to.slice(0, 40))}`, focus: [{ kind: 'item', id: target.id, how: 'changed' }] })
          return
        }
        const what = isFrame(target) ? 'frame' : 'note'
        pending.push({
          kind: 'edit',
          id: target.id,
          ref,
          what,
          from,
          to,
          prompt: `Droplet suggests changing ${isFrame(target) ? 'the title of a frame' : 'one of your notes'}. Now: ${quoted(from.slice(0, 120))}. Suggested: ${quoted(to.slice(0, 120))}.`,
        })
        return
      }

      case 'colour': {
        const said = plainWords(action.quote)
        if (said === '' || !plainWords(founderText).includes(said)) return skip(`quote: "${action.quote}" is not in the founder's words. Recolour only when they asked for a colour, and quote them exactly.`)
        if (!COLOUR_WORDS.test(action.quote)) return skip(`quote: "${action.quote}" does not ask for a colour. Recolour only when the founder asked for one.`)
        const painting: BoardItem[] = []
        for (const ref of action.things) {
          const item = find(ref)
          if (!item) return skip(missing(ref))
          if (item.kind === 'note' && item.author === 'ai') return skip(`${name(item)} is a note by Droplet, which is pink. The founder keeps it as theirs first, and then it can have a colour of their own.`)
          if (item.kind !== 'note' && item.kind !== 'shape' && item.kind !== 'frame') return skip(`${name(item)} has no colour to change. Only notes, shapes and frames do.`)
          if (item.kind === 'note' && !(FOUNDER_COLOURS as readonly string[]).includes(action.colour)) return skip(`A note cannot be ${action.colour}. Notes can be ${FOUNDER_COLOURS.join(', ')}.`)
          if (!(SHAPE_COLOURS as readonly string[]).includes(action.colour)) return skip(`${action.colour} is not a colour the founder can give a thing.`)
          painting.push(item)
        }
        const todo = painting.filter((item) => ('colour' in item ? item.colour : null) !== action.colour)
        if (todo.length === 0) return skip(`${painting.length === 1 ? 'That is' : 'Those are'} already ${action.colour}.`)
        if (!run([{ type: 'set_colour', ids: todo.map((item) => item.id), colour: action.colour }])) return skip('That could not be recoloured.')
        changes.push({ kind: 'changed', text: `${plural(todo.length, 'thing')} made ${action.colour}`, focus: todo.map((item) => ({ kind: 'item' as const, id: item.id, how: 'changed' as const })) })
        return
      }

      case 'summary_frame': {
        if (used.summaries >= 1) return skip('Only one summary can be written in a reply.')
        const lines = [...action.decided.map((line) => `Decided: ${line}`), ...action.open.map((line) => `Open: ${line}`), ...action.next.map((line) => `Next: ${line}`)]
        if (lines.length === 0) return skip('There is nothing to put in a summary.')
        if (lines.length > MAX_AI_SUMMARY_LINES) return skip(`A summary has at most ${MAX_AI_SUMMARY_LINES} lines.`)
        if (used.notes + lines.length > MAX_AI_NOTES) return skip(`That would be more than ${MAX_AI_NOTES} notes in one reply, which is the most.`)
        if (!room(lines.length + 1)) return skip('The board already holds as many things as it can.')
        const layout = layoutCluster(lines.map(() => ({ ...AI_NOTE })))
        const origin = placeCluster(items(), layout, view, [])
        if (!origin) return skip('There is no clear space on the board for a summary that size.')
        const frameId = newId()
        const noteIds = lines.map(() => newId())
        const steps: BoardAction[] = [
          { type: 'add_frame', id: frameId, rect: { ...origin, ...layout.frame }, title: 'Where things stand', colour: 'white' },
          ...lines.map((line, index): BoardAction => ({ type: 'add_note', id: noteIds[index], rect: { x: origin.x + layout.rects[index].x, y: origin.y + layout.rects[index].y, ...AI_NOTE }, text: line, author: 'ai' })),
        ]
        if (!run(steps)) return skip('The summary could not be written on the board.')
        used.summaries += 1
        used.notes += lines.length
        changes.push({ kind: 'added', text: `A summary frame, ${plural(lines.length, 'note')}`, focus: [frameId, ...noteIds].map((id) => ({ kind: 'item' as const, id, how: 'added' as const })) })
        return
      }

      case 'undo':
      case 'redo':
        return
    }
  })

  return { state: collected.length > 0 ? reduceBoard(base, { type: 'batch', actions: collected }) : base, skipped, changes, pending }
}
