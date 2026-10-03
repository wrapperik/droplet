import { COLS, placeRelative, type Heights, type Placement } from '../lib/gridLayout.ts'
import { replaceableIds } from '../lib/harmony.ts'
import { createHistory } from '../lib/history.ts'
import type { PaletteBlock } from '../lib/palette.ts'
import {
  MAX_BLOCKS,
  MIN_BLOCKS,
  canRedoState,
  canUndoState,
  docOf,
  kindOf,
  mergeLayout,
  reduce,
  type WorkspaceAction,
  type WorkspaceState,
} from '../lib/workspaceState.ts'
import { paletteErrors } from './paletteRules.ts'
import type { TurnAction } from './spec.ts'

// Turns the model's actions into workspace actions and applies them through the same reducer a person's clicks use.
// The model counts colours from 1 in the order shown, so each number is resolved against the workspace as it is at
// that step. Anything that cannot be done is left out with a plain reason, and the reasons are what goes back to
// the model if it has to try again.

export type ApplyEnv = {
  // Where each visible component is drawn now, and how tall each is, for moves relative to another component.
  layout: Placement[]
  heights: Heights
}

export type Skipped = { position: number; action: TurnAction; reason: string }
export type Effect = 'export'

export type ApplyResult = {
  state: WorkspaceState | null
  skipped: Skipped[]
  // Things for the app to do that are not changes to the workspace, such as downloading the brand sheet.
  effects: Effect[]
  // The turn opened a workspace that was not open before.
  opened: boolean
}

type Input = {
  // The workspace as it is now, or null if none is open.
  base: WorkspaceState | null
  // Makes a new workspace from these colours (using the project's saved layout, if it has one).
  open: (blocks: PaletteBlock[]) => WorkspaceState
  actions: TurnAction[]
  env: ApplyEnv
}

const PANEL_SIZES: Record<string, number> = { third: 8, half: 12, two_thirds: 16, full: 24 }
const TOOLBAR_SIZES: Record<string, number> = { compact: 0, large: 1 }

export function applyTurnActions({ base, open, actions, env }: Input): ApplyResult {
  const skipped: Skipped[] = []
  const effects: Effect[] = []
  const collected: WorkspaceAction[] = []

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
    if (reason || !base) return { state: base, skipped: [{ position, action, reason: reason ?? '' }], effects, opened: false }
    return { state: reduce(base, { type: action.type }), skipped, effects, opened: false }
  }

  let scratch: WorkspaceState | null = base
  let opened = false
  let currentLayout: Placement[] = env.layout

  const visibleLayout = (state: WorkspaceState) => docOf(state).layout.filter((p) => !docOf(state).hidden.includes(p.id))

  actions.forEach((action, position) => {
    const skip = (reason: string) => void skipped.push({ position, action, reason })

    if (!scratch) {
      if (action.type !== 'set_palette') return skip('No workspace is open yet. Start with a set_palette action.')
      const errors = paletteErrors(action.colours)
      if (errors.length > 0) return skip(errors.join(' '))
      scratch = open(action.colours.map(toBlock))
      currentLayout = visibleLayout(scratch)
      opened = true
    }

    const blocks = docOf(scratch).blocks
    const idAt = (number: number) => blocks[number - 1]?.id
    const missing = (number: number) => `There is no colour ${number}. The palette has ${blocks.length} colours, numbered 1 to ${blocks.length}.`
    const isShown = (component: string) => currentLayout.some((p) => p.id === component)

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
      case 'show_component':
        next = [{ type: 'show', component: action.component, reason: action.reason }]
        break
      case 'hide_component':
        next = [{ type: 'hide', component: action.component }]
        break
      case 'move_component': {
        if (action.component === action.relativeTo) return skip(`A component cannot be placed relative to itself ("${action.component}").`)
        for (const component of [action.component, action.relativeTo]) {
          if (!isShown(component)) return skip(`The "${component}" component is not on screen. Show it first.`)
        }
        // Beside another component needs room beside it. A full-width panel has none, and a drop there would only
        // push it down, so say so and let the model make it narrower first, as a person would.
        const target = currentLayout.find((p) => p.id === action.relativeTo)!
        const moving = currentLayout.find((p) => p.id === action.component)!
        if (action.placement === 'right_of' || action.placement === 'left_of') {
          const room = action.placement === 'right_of' ? COLS - (target.col + target.w) : target.col
          if (room < moving.w) {
            return skip(
              `There is no room ${action.placement.replace('_', ' ')} "${action.relativeTo}": it leaves ${room} of 24 columns and "${action.component}" needs ${moving.w}. Make "${action.relativeTo}" narrower first with resize_component (for example half), or make "${action.component}" smaller, then move it.`,
            )
          }
        }
        const moved = placeRelative(currentLayout, env.heights, action.component, action.relativeTo, action.placement)
        if (!moved) return skip(`Could not place "${action.component}" ${action.placement.replace('_', ' ')} "${action.relativeTo}".`)
        currentLayout = moved
        next = [{ type: 'layout', layout: mergeLayout(docOf(scratch).layout, moved) }]
        break
      }
      case 'resize_component': {
        if (!isShown(action.component)) return skip(`The "${action.component}" component is not on screen. Show it first.`)
        const kind = kindOf(action.component)
        const table = kind === 'panel' ? PANEL_SIZES : TOOLBAR_SIZES
        const value = table[action.size]
        if (value === undefined) {
          return skip(
            kind === 'panel'
              ? `"${action.component}" is a panel, so its size is third, half, two_thirds or full.`
              : `"${action.component}" is a toolbar, so its size is compact or large.`,
          )
        }
        next = [{ type: 'resize', id: action.component, value }]
        // A panel's new width counts for the moves that follow in this turn.
        if (kind === 'panel') currentLayout = currentLayout.map((p) => (p.id === action.component ? { ...p, w: value } : p))
        break
      }
      case 'reset_layout':
        next = [{ type: 'reset_layout' }]
        break
      case 'export_brand_sheet':
        effects.push('export')
        return
      case 'undo':
      case 'redo':
        return
    }

    for (const step of next) scratch = reduce(scratch!, step)
    collected.push(...next)

    // Keep the picture of what is on screen up to date for the moves that follow.
    if (action.type === 'show_component' || action.type === 'hide_component' || action.type === 'reset_layout') {
      currentLayout = visibleLayout(scratch!)
    }
  })

  if (!scratch) return { state: base, skipped, effects, opened: false }

  // The turn as a whole must leave a palette that can still carry text. A person may do as they like, but the model
  // may not leave the founder with colours nothing can be read on.
  const startBlocks = base ? docOf(base).blocks : null
  const finalBlocks = docOf(scratch).blocks
  if (collected.length > 0 && JSON.stringify(startBlocks) !== JSON.stringify(finalBlocks)) {
    const errors = paletteErrors(finalBlocks)
    if (errors.length > 0) {
      const position = Math.max(0, actions.length - 1)
      return { state: base, skipped: [...skipped, { position, action: actions[position], reason: `After these changes: ${errors.join(' ')}` }], effects: [], opened: false }
    }
  }

  const first = opened ? scratch : base ? reduce(base, { type: 'batch', actions: collected }) : scratch
  // A workspace opened by this turn starts with a clean history: there is nothing earlier to undo to.
  const state = opened ? { ...first, history: createHistory(docOf(first)) } : first
  return { state, skipped, effects, opened }
}

function toBlock(colour: { hex: string; name: string; rationale: string; role?: PaletteBlock['role'] }, index: number): PaletteBlock {
  return { id: index + 1, hex: colour.hex.toUpperCase(), name: colour.name, note: colour.rationale, ...(colour.role ? { role: colour.role } : {}) }
}

