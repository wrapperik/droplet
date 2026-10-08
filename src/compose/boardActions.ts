import type { Point } from '../lib/boardGeometry.ts'
import { AI_NOTE, layoutCluster, middleOf, placeCluster, roomInFrame, slotInFrame, spotLoose, spotNear } from '../lib/boardPlacement.ts'
import { canRedoBoard, canUndoBoard, docOf, reduceBoard, type BoardAction, type BoardState } from '../lib/boardState.ts'
import { groupFor, instantiateTemplate, placeTemplate, promptsOf, templateById } from '../lib/boardTemplates.ts'
import { attachedTo, describeItem, isConnector, isFrame, isNode, isRectItem, MAX_ITEMS, type BoardItem, type RectItem } from '../lib/boardTypes.ts'
import { newId as freshId } from '../lib/ids.ts'
import { refsOf } from './boardSnapshot.ts'
import { plural, type Change, type FocusTarget } from './receipt.ts'
import { MAX_AI_ARROWS, MAX_AI_CLUSTERS, MAX_AI_NOTES, type BoardTurnAction } from './boardSpec.ts'

// Turns the model's actions on the board into board actions and applies them through the same reducer a person's edits use. Anything that
// cannot be done is left out with a plain reason, and the reasons are what goes back to the model if it has to try again. A turn is one step in
// the history, so one Undo takes back everything the model did.
//
// What is done here is also what keeps the model in its place. It names things by their references and never gives a position, a size or a
// colour: the places come from `boardPlacement`, and a note by Droplet is pink with its name on it, whatever the model said. It can add, and it
// can gather notes into a frame, but it cannot edit, recolour or delete what the founder made, and it cannot write over a note that has words in it.

export type BoardSkipped = { position: number; action: BoardTurnAction; reason: string }

type Props = {
  base: BoardState
  actions: BoardTurnAction[]
  // The middle of what the founder is looking at, where things with no place of their own go.
  view: Point
  // Makes the id of a new thing. Given so that the server's check and a test need not make random ones.
  newId?: () => string
}

// `changes` is what was done, for the change receipt: notes added to the same place are one line, and so are arrows and filled prompts.
export type BoardApplyResult = { state: BoardState; skipped: BoardSkipped[]; changes: Change[] }

export function applyBoardTurnActions({ base, actions, view, newId = freshId }: Props): BoardApplyResult {
  const skipped: BoardSkipped[] = []

  // Undo and redo take back or restore a whole step, so they stand alone.
  const history = actions.find((action) => action.type === 'undo' || action.type === 'redo')
  if (history) {
    const position = actions.indexOf(history)
    const reason =
      actions.length > 1 ? 'Undo and redo cannot be combined with other actions. Send them on their own.'
      : history.type === 'undo' && !canUndoBoard(base) ? 'There is nothing to undo.'
      : history.type === 'redo' && !canRedoBoard(base) ? 'There is nothing to redo.'
      : null
    if (reason) return { state: base, skipped: [{ position, action: history, reason }], changes: [] }
    return { state: reduceBoard(base, { type: history.type }), skipped, changes: [{ kind: 'changed', text: history.type === 'undo' ? 'Took back the last change' : 'Put back the change that was taken back', focus: [] }] }
  }

  // The references mean what they meant when the board was shown, all the way through the turn, even after things are moved.
  const idOf = new Map([...refsOf(docOf(base).items)].map(([id, ref]) => [ref, id]))
  let scratch = base
  const collected: BoardAction[] = []
  const used = { notes: 0, clusters: 0, templates: 0, arrows: 0 }
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

      case 'undo':
      case 'redo':
        return
    }
  })

  return { state: collected.length > 0 ? reduceBoard(base, { type: 'batch', actions: collected }) : base, skipped, changes }
}
