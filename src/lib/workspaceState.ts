import { shiftHue } from './colour.ts'
import { AUTO_COL, nearestStep, reconcile, samePlacements, type Placement } from './gridLayout.ts'
import { generatePalette, replaceableIds, type Harmony } from './harmony.ts'
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from './history.ts'
import { assignRole, withHex, type ColourRole, type PaletteBlock } from './palette.ts'
import type { PaletteSave } from './paletteSave.ts'

// Everything about the palette workspace that can change, and the one set of actions that changes it. The interface
// and the AI both go through `reduce`, so the AI can do exactly what a person can and nothing else, and one undo
// step covers a person's click or a whole turn of the AI's.

export const MAX_BLOCKS = 8
export const MIN_BLOCKS = 2 // a palette needs at least a pair, and the checks need a colour to read against

// Panels snap to these widths, in columns (out of 24): a third, half, two thirds and the full width.
export const PANEL_STEPS = [8, 12, 16, 24]
// A toolbar has two versions, the compact one it starts as and a larger one with more in it.
export const TOOLBAR_VERSIONS = ['Compact', 'Large']

export type ComponentKind = 'toolbar' | 'panel'
export const COMPONENTS: { id: string; label: string; kind: ComponentKind; hideable: boolean }[] = [
  { id: 'picker', label: 'Colour picker', kind: 'toolbar', hideable: true },
  { id: 'role', label: 'Colour role', kind: 'toolbar', hideable: true },
  { id: 'generate', label: 'Generate', kind: 'toolbar', hideable: true },
  { id: 'canvas', label: 'Palette canvas', kind: 'panel', hideable: false },
  { id: 'preview', label: 'Preview', kind: 'panel', hideable: true },
]
export const PANELS = COMPONENTS.filter((c) => c.kind === 'panel').map((c) => c.id)
export const kindOf = (id: string) => COMPONENTS.find((c) => c.id === id)?.kind

// Where things start, and where "Reset layout" puts them. The three toolbars in one row across the top: each starts
// where the one before it ends, so neighbours are exactly one grid gap apart, and one that does not fit in what is
// left of the row drops beneath the first, lined up with it. Then the white canvas full width, and the document
// preview under that. Toolbar widths come from their content and rows are only a preference.
export const DEFAULT_LAYOUT: Placement[] = [
  { id: 'picker', col: 0, row: 0, w: 8 },
  { id: 'role', col: AUTO_COL, row: 0, w: 10 },
  { id: 'generate', col: AUTO_COL, row: 0, w: 9 },
  { id: 'canvas', col: 0, row: 10, w: 24 },
  { id: 'preview', col: 0, row: 20, w: 12 },
]

export type Doc = {
  blocks: PaletteBlock[]
  layout: Placement[]
  // Which version each toolbar is on; 0 (the default) is left out.
  sizes: Record<string, number>
  // Components the founder (or the AI) has taken off the screen.
  hidden: string[]
  // One line on why a component is on screen, where the composer gave one.
  reasons: Record<string, string>
  businessName?: string
}

export type WorkspaceState = {
  history: History<Doc>
  selectedId: number
  harmony: Harmony
  variation: number
}

export type WorkspaceAction =
  | { type: 'select'; id: number }
  | { type: 'set_hex'; id: number; hex: string; name?: string; note?: string }
  | { type: 'set_palette'; blocks: PaletteBlock[]; reason?: string; businessName?: string }
  | { type: 'add_block'; hex?: string; name?: string; note?: string; role?: ColourRole }
  | { type: 'remove_block'; id: number }
  | { type: 'set_role'; id: number; role: ColourRole | null }
  | { type: 'toggle_keep'; id: number; keep?: boolean }
  | { type: 'set_harmony'; harmony: Harmony }
  | { type: 'generate'; fromId?: number }
  | { type: 'layout'; layout: Placement[] }
  | { type: 'resize'; id: string; value: number }
  | { type: 'show'; component: string; reason?: string }
  | { type: 'hide'; component: string }
  | { type: 'reset_layout' }
  | { type: 'undo' }
  | { type: 'redo' }
  // Several actions applied together and undone together.
  | { type: 'batch'; actions: WorkspaceAction[] }

// A layout of the visible items put back into the full layout, which also remembers where hidden items belong.
export const mergeLayout = (all: Placement[], visible: Placement[]): Placement[] => [
  ...visible,
  ...all.filter((placement) => !visible.some((v) => v.id === placement.id)),
]

export const changedSizes = (sizes: Record<string, number>) => Object.fromEntries(Object.entries(sizes).filter(([, version]) => version > 0))

// A workspace with these colours, arranged as the project's saved layout if there is one.
export function openWorkspace(blocks: PaletteBlock[], saved?: PaletteSave | null): WorkspaceState {
  const layout = saved
    ? reconcile(saved.layout, DEFAULT_LAYOUT, PANELS).map((p) => (PANELS.includes(p.id) ? { ...p, w: nearestStep(PANEL_STEPS, p.w) } : p))
    : DEFAULT_LAYOUT
  const doc: Doc = { blocks, layout, sizes: changedSizes(saved?.sizes ?? {}), hidden: saved?.hidden ?? [], reasons: {} }
  return { history: createHistory(doc), selectedId: blocks[0].id, harmony: 'analogous', variation: 0 }
}

export const docOf = (state: WorkspaceState): Doc => state.history.present
export const selectedBlock = (state: WorkspaceState): PaletteBlock => {
  const { blocks } = docOf(state)
  return blocks.find((block) => block.id === state.selectedId) ?? blocks[0]
}
export const isVisible = (doc: Doc, id: string) => !doc.hidden.includes(id)
export const canUndoState = (state: WorkspaceState) => canUndo(state.history)
export const canRedoState = (state: WorkspaceState) => canRedo(state.history)

export const layoutIsDefault = (doc: Doc) => samePlacements(doc.layout, DEFAULT_LAYOUT) && Object.keys(doc.sizes).length === 0

export function isUnsaved(doc: Doc, saved: PaletteSave | null): boolean {
  return (
    !saved ||
    JSON.stringify(doc.blocks) !== JSON.stringify(saved.blocks) ||
    !samePlacements(doc.layout, saved.layout) ||
    JSON.stringify(doc.sizes) !== JSON.stringify(changedSizes(saved.sizes ?? {})) ||
    JSON.stringify([...doc.hidden].sort()) !== JSON.stringify([...(saved.hidden ?? [])].sort())
  )
}

type Working = { doc: Doc; selectedId: number; harmony: Harmony; variation: number }

const withBlocks = (w: Working, blocks: PaletteBlock[]): Working => ({ ...w, doc: { ...w.doc, blocks } })

function step(w: Working, action: WorkspaceAction): Working {
  const { blocks } = w.doc
  switch (action.type) {
    case 'select':
      return blocks.some((b) => b.id === action.id) ? { ...w, selectedId: action.id } : w

    case 'set_hex': {
      if (!blocks.some((b) => b.id === action.id && b.hex !== action.hex)) return w
      return withBlocks(
        w,
        blocks.map((b) => {
          if (b.id !== action.id) return b
          const next = withHex(b, action.hex)
          // A new colour from the composer comes with its own name and note.
          return { ...next, ...(action.name ? { name: action.name } : {}), ...(action.note ? { note: action.note } : {}) }
        }),
      )
    }

    case 'set_palette': {
      const next = action.blocks.map((block, index) => ({ ...block, id: index + 1 }))
      const reasons = { ...w.doc.reasons }
      if (action.reason) reasons.canvas = action.reason
      return {
        doc: { ...w.doc, blocks: next, reasons, businessName: action.businessName ?? w.doc.businessName },
        selectedId: next[0].id,
        harmony: w.harmony,
        variation: 0,
      }
    }

    case 'add_block': {
      if (blocks.length >= MAX_BLOCKS) return w
      const id = Math.max(...blocks.map((b) => b.id)) + 1
      const selected = blocks.find((b) => b.id === w.selectedId) ?? blocks[0]
      const block: PaletteBlock = {
        id,
        hex: action.hex ?? shiftHue(selected.hex, 45),
        ...(action.name ? { name: action.name } : {}),
        ...(action.note ? { note: action.note } : {}),
      }
      const added = [...blocks, block]
      return { ...withBlocks(w, action.role ? assignRole(added, id, action.role) : added), selectedId: id }
    }

    case 'remove_block': {
      const index = blocks.findIndex((b) => b.id === action.id)
      if (index < 0 || blocks.length <= MIN_BLOCKS) return w
      const remaining = blocks.filter((b) => b.id !== action.id)
      const selectedId = action.id === w.selectedId ? remaining[Math.min(index, remaining.length - 1)].id : w.selectedId
      return { ...withBlocks(w, remaining), selectedId }
    }

    case 'set_role': {
      const current = blocks.find((b) => b.id === action.id)
      if (!current || (current.role ?? null) === action.role) return w
      return withBlocks(w, assignRole(blocks, action.id, action.role))
    }

    case 'toggle_keep': {
      const current = blocks.find((b) => b.id === action.id)
      if (!current) return w
      const keep = action.keep ?? !current.locked
      if (Boolean(current.locked) === keep) return w
      return withBlocks(w, blocks.map((b) => {
        if (b.id !== action.id) return b
        const copy = { ...b }
        if (keep) copy.locked = true
        else delete copy.locked
        return copy
      }))
    }

    case 'set_harmony':
      return w.harmony === action.harmony ? w : { ...w, harmony: action.harmony }

    case 'generate': {
      const base = action.fromId ?? w.selectedId
      if (!blocks.some((b) => b.id === base) || replaceableIds(blocks, base).length === 0) return w
      return { ...withBlocks(w, generatePalette(blocks, base, w.harmony, w.variation)), selectedId: base, variation: w.variation + 1 }
    }

    case 'layout':
      return { ...w, doc: { ...w.doc, layout: action.layout } }

    case 'resize': {
      const kind = kindOf(action.id)
      if (kind === 'panel') {
        const width = nearestStep(PANEL_STEPS, action.value)
        return { ...w, doc: { ...w.doc, layout: w.doc.layout.map((p) => (p.id === action.id ? { ...p, w: width } : p)) } }
      }
      if (kind === 'toolbar') return { ...w, doc: { ...w.doc, sizes: changedSizes({ ...w.doc.sizes, [action.id]: action.value }) } }
      return w
    }

    case 'show': {
      const reasons = action.reason ? { ...w.doc.reasons, [action.component]: action.reason } : w.doc.reasons
      if (!w.doc.hidden.includes(action.component) && reasons === w.doc.reasons) return w
      return { ...w, doc: { ...w.doc, hidden: w.doc.hidden.filter((id) => id !== action.component), reasons } }
    }

    case 'hide': {
      const component = COMPONENTS.find((c) => c.id === action.component)
      if (!component?.hideable || w.doc.hidden.includes(action.component)) return w
      return { ...w, doc: { ...w.doc, hidden: [...w.doc.hidden, action.component] } }
    }

    case 'reset_layout':
      return { ...w, doc: { ...w.doc, layout: DEFAULT_LAYOUT, sizes: {} } }

    case 'batch':
      return action.actions.reduce(step, w)

    case 'undo':
    case 'redo':
      return w
  }
}

// After an undo the selected colour may no longer exist, so fall back to the first.
const keepSelection = (state: WorkspaceState): WorkspaceState => {
  const { blocks } = docOf(state)
  return blocks.some((b) => b.id === state.selectedId) ? state : { ...state, selectedId: blocks[0].id }
}

export function reduce(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  if (action.type === 'undo') return keepSelection({ ...state, history: undo(state.history) })
  if (action.type === 'redo') return keepSelection({ ...state, history: redo(state.history) })

  const end = step({ doc: state.history.present, selectedId: state.selectedId, harmony: state.harmony, variation: state.variation }, action)
  // Quick edits to the same colour (dragging across the spectrum) are one step.
  const key = action.type === 'set_hex' ? `colour-${action.id}` : null
  const history = commit(state.history, end.doc, key)
  if (history === state.history && end.selectedId === state.selectedId && end.harmony === state.harmony && end.variation === state.variation) return state
  return { history, selectedId: end.selectedId, harmony: end.harmony, variation: end.variation }
}
