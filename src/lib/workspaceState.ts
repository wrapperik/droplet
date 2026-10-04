import { shiftHue } from './colour.ts'
import {
  PANEL_MIN_COLS,
  arrangementIsDefault,
  arrangementUnsaved,
  clampPanelWidth,
  isArrangementAction,
  isExpanded as isExpandedIn,
  isVisible as isVisibleIn,
  isWindow as isWindowIn,
  kindOf as kindOfIn,
  mergeLayout,
  normaliseExpanded as normaliseExpandedIn,
  normaliseTools as normaliseToolsIn,
  openArrangement,
  panelIds,
  reduceArrangement,
  shownWindows as shownWindowsIn,
  toolIds,
  toolbarTools as toolbarToolsIn,
  type Arrangement,
  type ArrangementAction,
  type ArrangementSpec,
  type ComponentKind,
} from './arrangement.ts'
import type { Placement } from './gridLayout.ts'
import { generatePalette, replaceableIds, type Harmony } from './harmony.ts'
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from './history.ts'
import { assignRole, withHex, type ColourRole, type PaletteBlock } from './palette.ts'
import type { PaletteSave } from './paletteSave.ts'

// Everything about the palette workspace that can change, and the one set of actions that changes it. The interface
// and the AI both go through `reduce`, so the AI can do exactly what a person can and nothing else, and one undo
// step covers a person's click or a whole turn of the AI's.

export const MAX_BLOCKS = 8
export const MIN_BLOCKS = 2 // a palette needs at least a pair, and the checks need a colour to read against

export { PANEL_MIN_COLS, clampPanelWidth, mergeLayout }
export type { ComponentKind }

export const COMPONENTS: ArrangementSpec['components'] = [
  { id: 'picker', label: 'Colour picker', kind: 'toolbar', hideable: true },
  { id: 'role', label: 'Colour role', kind: 'toolbar', hideable: true },
  { id: 'generate', label: 'Generate', kind: 'toolbar', hideable: true },
  { id: 'canvas', label: 'Palette canvas', kind: 'panel', hideable: false },
  { id: 'preview', label: 'Preview', kind: 'panel', hideable: true },
]

// How big each window starts, in columns, and roughly how tall it is in pixels.
export const WINDOW_SIZES: ArrangementSpec['windowSizes'] = {
  canvas: { w: 14, heightPx: 240 },
  preview: { w: 10, heightPx: 420 },
  picker: { w: 10, heightPx: 440 },
  role: { w: 8, heightPx: 300 },
  generate: { w: 8, heightPx: 340 },
}

// Where the windows start, and where "Reset layout" puts them: the palette canvas beside the document preview, sharing the
// row fourteen columns to ten. Tools that are windows have a place too, kept for when they are dragged out. Rows are only
// a preference, and each window rises as far as it can.
export const DEFAULT_LAYOUT: Placement[] = [
  { id: 'canvas', col: 0, row: 0, w: 14 },
  { id: 'preview', col: 14, row: 0, w: 10 },
  { id: 'picker', col: 0, row: 30, w: WINDOW_SIZES.picker.w },
  { id: 'role', col: 10, row: 30, w: WINDOW_SIZES.role.w },
  { id: 'generate', col: 16, row: 30, w: WINDOW_SIZES.generate.w },
]

// How the palette workspace is arranged: its tools, its windows and where they start.
export const PALETTE_SPEC: ArrangementSpec = { components: COMPONENTS, layout: DEFAULT_LAYOUT, windowSizes: WINDOW_SIZES }

export const PANELS = panelIds(PALETTE_SPEC)
export const TOOLS = toolIds(PALETTE_SPEC)
export const kindOf = (id: string) => kindOfIn(PALETTE_SPEC, id)

// The order the tools start in, left to right.
export const DEFAULT_TOOLS = [...TOOLS]
export const normaliseTools = (order: string[] | undefined) => normaliseToolsIn(PALETTE_SPEC, order)
export const normaliseExpanded = (ids: string[] | undefined) => normaliseExpandedIn(PALETTE_SPEC, ids)

export type Doc = Arrangement & {
  blocks: PaletteBlock[]
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
  | ArrangementAction
  | { type: 'undo' }
  | { type: 'redo' }
  // Several actions applied together and undone together.
  | { type: 'batch'; actions: WorkspaceAction[] }

// A workspace with these colours, arranged as the project's saved layout if there is one.
export function openWorkspace(blocks: PaletteBlock[], saved?: PaletteSave | null): WorkspaceState {
  const doc: Doc = { blocks, ...openArrangement(PALETTE_SPEC, saved) }
  return { history: createHistory(doc), selectedId: blocks[0].id, harmony: 'analogous', variation: 0 }
}

export const docOf = (state: WorkspaceState): Doc => state.history.present
export const selectedBlock = (state: WorkspaceState): PaletteBlock => {
  const { blocks } = docOf(state)
  return blocks.find((block) => block.id === state.selectedId) ?? blocks[0]
}
export const isVisible = (doc: Doc, id: string) => isVisibleIn(doc, id)
export const isExpanded = (doc: Doc, id: string) => isExpandedIn(doc, id)
// The tools that are in the toolbar, left to right.
export const toolbarTools = (doc: Doc) => toolbarToolsIn(doc)
// What is a window on the grid: the panels, and the tools that have been dragged out of the toolbar.
export const isWindow = (doc: Doc, id: string) => isWindowIn(PALETTE_SPEC, doc, id)
export const shownWindows = (doc: Doc) => shownWindowsIn(PALETTE_SPEC, doc)
export const canUndoState = (state: WorkspaceState) => canUndo(state.history)
export const canRedoState = (state: WorkspaceState) => canRedo(state.history)

// Whether everything is where it starts: the same windows in the same places, and the tools in the toolbar in order.
export const layoutIsDefault = (doc: Doc) => arrangementIsDefault(PALETTE_SPEC, doc)

// Whether two palettes are the same, whatever order the fields of a colour were written in. What is read back from storage has its fields in
// the order of the schema, not of the code that made them, so comparing them as text would call a palette that was saved changed.
export function sameBlocks(a: { id: number; hex: string; role?: string; locked?: boolean; name?: string; note?: string }[], b: typeof a): boolean {
  const key = (block: (typeof a)[number]) => [block.id, block.hex, block.role ?? '', block.locked ? 1 : 0, block.name ?? '', block.note ?? ''].join('\u0000')
  return a.length === b.length && a.every((block, index) => key(block) === key(b[index]))
}

export function isUnsaved(doc: Doc, saved: PaletteSave | null): boolean {
  return !saved || !sameBlocks(doc.blocks, saved.blocks) || arrangementUnsaved(PALETTE_SPEC, doc, saved)
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

    case 'batch':
      return action.actions.reduce(step, w)

    case 'undo':
    case 'redo':
      return w

    default: {
      // Everything else is the arrangement: layout, tools, expanded tools, and what is hidden.
      if (!isArrangementAction(action)) return w
      const next = reduceArrangement(PALETTE_SPEC, w.doc, action)
      return next === w.doc ? w : { ...w, doc: next }
    }
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
