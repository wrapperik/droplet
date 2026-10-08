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
  isExpanded,
  isWindow,
  mergeLayout,
  shownWindows,
  toolbarTools,
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

export type ApplyEnv = {
  // Where each visible component is drawn now, and how tall each is, for moves relative to another component.
  layout: Placement[]
  heights: Heights
}

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
  env: ApplyEnv
}

const PANEL_SIZES: Record<string, number> = { third: 8, half: 12, two_thirds: 16, full: 24 }

export function applyTurnActions({ base, open, actions, env }: Input): ApplyResult {
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
  let currentLayout: Placement[] = env.layout

  const visibleLayout = (state: WorkspaceState) => docOf(state).layout.filter((p) => shownWindows(docOf(state)).includes(p.id))

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
    // A tool in the toolbar is on screen unless it is hidden. A window is on screen if it is on the grid.
    const inToolbar = (component: string) => toolbarTools(docOf(scratch!)).includes(component)
    const isShown = (component: string) => inToolbar(component) || currentLayout.some((p) => p.id === component)

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
        // Tools sit side by side in the toolbar, windows sit on the grid, and the two cannot be placed against each other.
        const movingTool = inToolbar(action.component)
        const targetTool = inToolbar(action.relativeTo)
        if (movingTool !== targetTool) {
          return skip(
            `"${movingTool ? action.component : action.relativeTo}" is a tool, which sits in the toolbar, and "${movingTool ? action.relativeTo : action.component}" is a window on the grid, so one cannot be placed relative to the other. Tools go left_of or right_of other tools. Windows go above, below, left_of or right_of other windows.`,
          )
        }
        if (movingTool) {
          if (action.placement === 'above' || action.placement === 'below') return skip('Tools sit side by side in the toolbar, so use left_of or right_of.')
          const order = toolbarTools(docOf(scratch))
          const rest = order.filter((id) => id !== action.component)
          const at = rest.indexOf(action.relativeTo)
          const before = action.placement === 'left_of' ? action.relativeTo : (rest[at + 1] ?? null)
          const result = [...rest.slice(0, before === null ? rest.length : rest.indexOf(before)), action.component, ...rest.slice(before === null ? rest.length : rest.indexOf(before))]
          if (result.join() === order.join()) return skip(`"${action.component}" is already ${action.placement.replace('_', ' ')} "${action.relativeTo}".`)
          next = [{ type: 'move_tool', id: action.component, before }]
          break
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
        if (inToolbar(action.component)) {
          return skip(`"${action.component}" is a tool in the toolbar, which has one size. Use expand_tool to make it a window, then resize it.`)
        }
        const value = PANEL_SIZES[action.size]
        next = [{ type: 'resize', id: action.component, value }]
        // A window's new width counts for the moves that follow in this turn.
        currentLayout = currentLayout.map((p) => (p.id === action.component ? { ...p, w: value } : p))
        break
      }
      case 'expand_tool': {
        const doc = docOf(scratch)
        if (isExpanded(doc, action.component)) return skip(`"${action.component}" is already a window.`)
        if (doc.hidden.includes(action.component)) return skip(`The "${action.component}" component is not on screen. Show it first.`)
        next = [{ type: 'expand_tool', id: action.component }]
        break
      }
      case 'collapse_tool': {
        const doc = docOf(scratch)
        if (!isExpanded(doc, action.component)) return skip(`"${action.component}" is already in the toolbar.`)
        if (!isWindow(doc, action.component)) return skip(`"${action.component}" is not a window.`)
        next = [{ type: 'collapse_tool', id: action.component }]
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
    const change = describeChange(action, blocks, docOf(scratch).blocks)
    if (change) changes.push(change)

    // Keep the picture of what is on screen up to date for the moves that follow.
    if (['show_component', 'hide_component', 'reset_layout', 'expand_tool', 'collapse_tool'].includes(action.type)) {
      currentLayout = visibleLayout(scratch!)
    }
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


const COMPONENT_LABEL: Record<string, string> = { picker: 'colour picker', role: 'role tool', generate: 'Generate tool', canvas: 'palette', preview: 'sample invoice' }
const label = (component: string) => COMPONENT_LABEL[component] ?? component
const PLACEMENT_WORDS: Record<string, string> = { above: 'above', below: 'below', left_of: 'to the left of', right_of: 'to the right of' }
const SIZE_WORDS: Record<string, string> = { third: 'a third', half: 'half', two_thirds: 'two thirds', full: 'the full' }
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
    case 'show_component':
      return { kind: 'added', text: `Showed the ${label(action.component)}`, focus: [{ kind: 'window', id: action.component, how: 'added' }] }
    case 'hide_component':
      return { kind: 'removed', text: `Hid the ${label(action.component)}`, focus: [{ kind: 'window', id: action.component, how: 'removed' }] }
    case 'move_component':
      return { kind: 'changed', text: `Moved the ${label(action.component)} ${PLACEMENT_WORDS[action.placement]} the ${label(action.relativeTo)}`, focus: [{ kind: 'window', id: action.component, how: 'moved' }] }
    case 'resize_component':
      return { kind: 'changed', text: `Made the ${label(action.component)} ${SIZE_WORDS[action.size]} width`, focus: [{ kind: 'window', id: action.component, how: 'changed' }] }
    case 'expand_tool':
      return { kind: 'changed', text: `Made the ${label(action.component)} a window`, focus: [{ kind: 'window', id: action.component, how: 'added' }] }
    case 'collapse_tool':
      return { kind: 'changed', text: `Put the ${label(action.component)} back in the toolbar`, focus: [] }
    case 'reset_layout':
      return { kind: 'changed', text: 'Reset the layout', focus: [] }
    default:
      return null
  }
}
