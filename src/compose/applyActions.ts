import { replaceableIds } from '../lib/harmony.ts'
import { createHistory } from '../lib/history.ts'
import type { PaletteBlock } from '../lib/palette.ts'
import {
  MAX_BLOCKS,
  MIN_BLOCKS,
  canRedoState,
  canUndoState,
  docOf,
  reduce,
  type WorkspaceAction,
  type WorkspaceState,
} from '../lib/workspaceState.ts'
import { hexToRgb, relativeLuminance } from '../lib/colour.ts'
import { paletteErrors } from './paletteRules.ts'
import { plural, type Change } from './receipt.ts'
import type { PaletteAction } from './spec.ts'

// Turns the model's actions into workspace actions and applies them through the same reducer a person's clicks use.
// The model counts colours from 1 in the order shown, so each number is resolved against the workspace as it is at
// that step. Anything that cannot be done is left out with a plain reason, and the reasons are what goes back to
// the model if it has to try again.

export type Skipped = { position: number; action: PaletteAction; reason: string }
export type Effect = 'export'

export type ApplyResult = {
  state: WorkspaceState | null
  skipped: Skipped[]
  // Things for the app to do that are not changes to the workspace, such as downloading the brand sheet.
  effects: Effect[]
  // The turn opened a workspace that was not open before.
  opened: boolean
  // What was done, in order, for the change receipt.
  changes: Change[]
}

type Input = {
  // The workspace as it is now, or null if none is open.
  base: WorkspaceState | null
  // Makes a new workspace from these colours (using the project's saved layout, if it has one).
  open: (blocks: PaletteBlock[]) => WorkspaceState
  actions: PaletteAction[]
}

export function applyTurnActions({ base, open, actions }: Input): ApplyResult {
  const skipped: Skipped[] = []
  const effects: Effect[] = []
  const collected: WorkspaceAction[] = []
  const changes: Change[] = []

  // Undo and redo take back or restore a whole step, so they stand alone.
  if (actions.some((a) => a.type === 'undo' || a.type === 'redo')) {
    const action = actions.find((a) => a.type === 'undo' || a.type === 'redo')!
    const position = actions.indexOf(action)
    const reason =
      actions.length > 1 ? 'Undo and redo cannot be combined with other actions. Send them on their own.'
      : !base ? 'There is no workspace to undo.'
      : action.type === 'undo' && !canUndoState(base) ? 'There is nothing to undo.'
      : action.type === 'redo' && !canRedoState(base) ? 'There is nothing to redo.'
      : null
    if (reason || !base) return { state: base, skipped: [{ position, action, reason: reason ?? '' }], effects, opened: false, changes: [] }
    return { state: reduce(base, { type: action.type }), skipped, effects, opened: false, changes: [{ kind: 'changed', text: action.type === 'undo' ? 'Took back the last change' : 'Put back the change that was taken back', focus: [] }] }
  }

  let scratch: WorkspaceState | null = base
  let opened = false

  actions.forEach((action, position) => {
    const skip = (reason: string) => void skipped.push({ position, action, reason })

    if (!scratch) {
      if (action.type !== 'set_palette') return skip('No workspace is open yet. Start with a set_palette action.')
      const errors = paletteErrors(action.colours)
      if (errors.length > 0) return skip(errors.join(' '))
      scratch = open(action.colours.map(toBlock))
      opened = true
    }

    const blocks = docOf(scratch).blocks
    const idAt = (number: number) => blocks[number - 1]?.id
    const missing = (number: number) => `There is no colour ${number}. The palette has ${blocks.length} colours, numbered 1 to ${blocks.length}.`
    let next: WorkspaceAction[] = []

    switch (action.type) {
      case 'set_palette': {
        const errors = paletteErrors(action.colours)
        if (errors.length > 0) return skip(errors.join(' '))
        next = [{ type: 'set_palette', blocks: action.colours.map(toBlock), reason: action.reason, businessName: action.businessName }]
        break
      }
      case 'set_colour': {
        const id = idAt(action.index)
        if (id === undefined) return skip(missing(action.index))
        next = [{ type: 'set_hex', id, hex: action.hex.toUpperCase(), name: action.name, note: action.rationale }]
        break
      }
      case 'add_colour':
        if (blocks.length >= MAX_BLOCKS) return skip(`The palette already has ${MAX_BLOCKS} colours, which is the most it can hold. Remove one first.`)
        next = [{ type: 'add_block', hex: action.hex.toUpperCase(), name: action.name, note: action.rationale, role: action.role }]
        break
      case 'remove_colour': {
        const id = idAt(action.index)
        if (id === undefined) return skip(missing(action.index))
        if (blocks.length <= MIN_BLOCKS) return skip(`The palette has only ${MIN_BLOCKS} colours, which is the fewest it can have.`)
        next = [{ type: 'remove_block', id }]
        break
      }
      case 'set_role': {
        const id = idAt(action.index)
        if (id === undefined) return skip(missing(action.index))
        next = [{ type: 'set_role', id, role: action.role === 'none' ? null : action.role }]
        break
      }
      case 'keep_colour': {
        const id = idAt(action.index)
        if (id === undefined) return skip(missing(action.index))
        next = [{ type: 'toggle_keep', id, keep: action.keep }]
        break
      }
      case 'select_colour': {
        const id = idAt(action.index)
        if (id === undefined) return skip(missing(action.index))
        next = [{ type: 'select', id }]
        break
      }
      case 'generate': {
        const from = action.from === undefined ? scratch.selectedId : idAt(action.from)
        if (from === undefined) return skip(missing(action.from ?? 0))
        if (replaceableIds(blocks, from).length === 0) return skip('Every other colour is kept, so there is nothing for Generate to fill in. Release a colour first.')
        next = [{ type: 'set_harmony', harmony: action.harmony }, { type: 'generate', fromId: from }]
        break
      }
      case 'export_brand_sheet':
        effects.push('export')
        return
      case 'undo':
      case 'redo':
        return
    }

    for (const step of next) scratch = reduce(scratch!, step)
    collected.push(...next)
    const change = describeChange(action, blocks, docOf(scratch).blocks)
    if (change) changes.push(change)
  })

  if (!scratch) return { state: base, skipped, effects, opened: false, changes: [] }

  // The turn as a whole must leave a palette that can still carry text. A person may do as they like, but the model
  // may not leave the founder with colours nothing can be read on.
  const startBlocks = base ? docOf(base).blocks : null
  const finalBlocks = docOf(scratch).blocks
  if (collected.length > 0 && JSON.stringify(startBlocks) !== JSON.stringify(finalBlocks)) {
    const errors = paletteErrors(finalBlocks)
    if (errors.length > 0) {
      const position = Math.max(0, actions.length - 1)
      return { state: base, skipped: [...skipped, { position, action: actions[position], reason: `After these changes: ${errors.join(' ')}` }], effects: [], opened: false, changes: [] }
    }
  }

  const first = opened ? scratch : base ? reduce(base, { type: 'batch', actions: collected }) : scratch
  // A workspace opened by this turn starts with a clean history: there is nothing earlier to undo to.
  const state = opened ? { ...first, history: createHistory(docOf(first)) } : first
  return { state, skipped, effects, opened, changes }
}

function toBlock(colour: { hex: string; name: string; rationale: string; role?: PaletteBlock['role'] }, index: number): PaletteBlock {
  return { id: index + 1, hex: colour.hex.toUpperCase(), name: colour.name, note: colour.rationale, ...(colour.role ? { role: colour.role } : {}) }
}


const ROLE_WORDS: Record<string, string> = { primary: 'the primary colour', accent: 'the accent colour', background: 'the background', text: 'the text colour' }

const lightness = (hex: string) => relativeLuminance(hexToRgb(hex))

// One line of the receipt for an action that was applied, worked out from the colours before and after it, and never from what the model said.
function describeChange(action: PaletteAction, before: PaletteBlock[], after: PaletteBlock[]): Change | null {
  const at = (index: number) => before[index - 1]
  const colour = (index: number) => `Colour ${index}`
  switch (action.type) {
    case 'set_palette': {
      const names = after.map((block) => block.name || block.hex)
      const shown = names.slice(0, 4).join(', ')
      return { kind: 'added', text: `A new palette of ${plural(after.length, 'colour')}: ${shown}${names.length > 4 ? ` and ${names.length - 4} more` : ''}`, focus: after.map((block) => ({ kind: 'block', id: block.id, how: 'added' })) }
    }
    case 'set_colour': {
      const old = at(action.index)
      const now = after[action.index - 1]
      const difference = lightness(now.hex) - lightness(old.hex)
      const how = Math.abs(difference) < 0.02 ? `changed to ${now.hex}` : `made ${difference < 0 ? 'darker' : 'lighter'} (${now.hex})`
      return { kind: 'changed', text: `${colour(action.index)} ${how}`, focus: [{ kind: 'block', id: now.id, how: 'changed' }] }
    }
    case 'add_colour': {
      const added = after.find((block) => !before.some((other) => other.id === block.id))
      return { kind: 'added', text: `Colour ${after.length} added: ${added?.name ? `${added.name}, ` : ''}${action.hex.toUpperCase()}`, focus: added ? [{ kind: 'block', id: added.id, how: 'added' }] : [] }
    }
    case 'remove_colour': {
      const old = at(action.index)
      return { kind: 'removed', text: `${colour(action.index)} removed (${old.name ? `${old.name}, ` : ''}${old.hex})`, focus: [{ kind: 'block', id: old.id, how: 'removed' }] }
    }
    case 'set_role': {
      const block = at(action.index)
      return {
        kind: 'changed',
        text: action.role === 'none' ? `Cleared the role of ${colour(action.index).toLowerCase()}` : `${colour(action.index)} is now ${ROLE_WORDS[action.role]}`,
        focus: [{ kind: 'block', id: block.id, how: 'changed' }],
      }
    }
    case 'keep_colour':
      return { kind: 'changed', text: `${colour(action.index)} ${action.keep ? 'will be kept when Generate fills in the others' : 'is no longer kept'}`, focus: [{ kind: 'block', id: at(action.index).id, how: 'changed' }] }
    case 'select_colour':
      return { kind: 'changed', text: `Selected ${colour(action.index).toLowerCase()}`, focus: [{ kind: 'block', id: at(action.index).id, how: 'changed' }] }
    case 'generate': {
      const changed = after.filter((block, index) => before[index] && before[index].hex !== block.hex)
      return { kind: 'changed', text: `Generated ${plural(changed.length, 'colour')} from ${action.harmony === 'monochrome' ? 'a monochrome harmony' : `a ${action.harmony} harmony`}`, focus: changed.map((block) => ({ kind: 'block', id: block.id, how: 'changed' })) }
    }
    default:
      return null
  }
}
