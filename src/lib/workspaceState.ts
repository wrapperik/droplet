import { shiftHue } from './colour.ts'
import { generatePalette, isRule, replaceableIds, type Harmony } from './harmony.ts'
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from './history.ts'
import { assignRole, withHex, type ColourRole, type PaletteBlock } from './palette.ts'
import type { PaletteSave } from './paletteSave.ts'

// Everything about the palette workspace that can change, and the one set of actions that changes it. The interface
// and the AI both go through `reduce`, so the AI can do exactly what a person can and nothing else, and one undo
// step covers a person's click or a whole turn of the AI's.

export const MAX_BLOCKS = 8
export const MIN_BLOCKS = 2 // a palette needs at least a pair, and the checks need a colour to read against

export type Doc = {
  blocks: PaletteBlock[]
  businessName?: string
  // One line on why a part of the screen is there, where the composer gave one (the palette's canvas, when it set the palette).
  reasons: Record<string, string>
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
  // "Keep in mind": Droplet's notes on the project always include the colour.
  | { type: 'toggle_star'; id: number; starred?: boolean }
  | { type: 'set_harmony'; harmony: Harmony }
  // Chooses a harmony and works the colours that are not kept out from the starting colour (the selected one unless `fromId` says), keeping the tones they
  // have. `variation` also chooses which arrangement of the tones. Custom has no rule, so it changes the harmony and nothing else.
  | { type: 'use_harmony'; harmony: Harmony; fromId?: number; variation?: number }
  // Moves one colour as the starting colour of the harmony: with a rule chosen the others follow it by the rule (kept colours stay); in Custom it is just a change
  // to that colour.
  | { type: 'set_base'; id: number; hex: string }
  | { type: 'generate'; fromId?: number }
  | { type: 'undo' }
  | { type: 'redo' }
  // Several actions applied together and undone together.
  | { type: 'batch'; actions: WorkspaceAction[] }

// A workspace with these colours. It starts on Custom: a palette that was saved, or made by hand, is not scrambled by changing one of its colours until a harmony is chosen.
export function openWorkspace(blocks: PaletteBlock[]): WorkspaceState {
  const doc: Doc = { blocks, reasons: {} }
  return { history: createHistory(doc), selectedId: blocks[0].id, harmony: 'custom', variation: 0 }
}

export const docOf = (state: WorkspaceState): Doc => state.history.present
export const selectedBlock = (state: WorkspaceState): PaletteBlock => {
  const { blocks } = docOf(state)
  return blocks.find((block) => block.id === state.selectedId) ?? blocks[0]
}
export const canUndoState = (state: WorkspaceState) => canUndo(state.history)
export const canRedoState = (state: WorkspaceState) => canRedo(state.history)

// Whether two palettes are the same, whatever order the fields of a colour were written in. What is read back from storage has its fields in
// the order of the schema, not of the code that made them, so comparing them as text would call a palette that was saved changed.
export function sameBlocks(a: { id: number; hex: string; role?: string; locked?: boolean; name?: string; note?: string }[], b: typeof a): boolean {
  const key = (block: (typeof a)[number]) => [block.id, block.hex, block.role ?? '', block.locked ? 1 : 0, block.name ?? '', block.note ?? ''].join('\u0000')
  return a.length === b.length && a.every((block, index) => key(block) === key(b[index]))
}

export function isUnsaved(doc: Doc, saved: PaletteSave | null): boolean {
  return !saved || !sameBlocks(doc.blocks, saved.blocks)
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
        // The new colours are not known to follow any rule, so the rule is dropped: changing one of them does not move the others.
        harmony: 'custom',
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

    case 'toggle_star': {
      const current = blocks.find((b) => b.id === action.id)
      if (!current) return w
      const starred = action.starred ?? !current.starred
      if (Boolean(current.starred) === starred) return w
      return withBlocks(w, blocks.map((b) => {
        if (b.id !== action.id) return b
        const { starred: _removed, ...rest } = b
        return starred ? { ...rest, starred: true } : rest
      }))
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

    case 'use_harmony': {
      const base = action.fromId ?? w.selectedId
      const variation = action.variation ?? w.variation
      const chosen = { ...w, harmony: action.harmony, variation }
      if (!isRule(action.harmony) || !blocks.some((b) => b.id === base) || replaceableIds(blocks, base).length === 0) return chosen
      return { ...withBlocks(chosen, generatePalette(blocks, base, action.harmony, variation)), selectedId: base }
    }

    case 'set_base': {
      const current = blocks.find((b) => b.id === action.id)
      if (!current || current.hex === action.hex) return w
      const moved = blocks.map((b) => (b.id === action.id ? withHex(b, action.hex) : b))
      return withBlocks(w, isRule(w.harmony) ? generatePalette(moved, action.id, w.harmony, w.variation) : moved)
    }

    case 'generate': {
      const base = action.fromId ?? w.selectedId
      if (!isRule(w.harmony) || !blocks.some((b) => b.id === base) || replaceableIds(blocks, base).length === 0) return w
      return { ...withBlocks(w, generatePalette(blocks, base, w.harmony, w.variation)), selectedId: base, variation: w.variation + 1 }
    }

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
  const key = action.type === 'set_hex' || action.type === 'set_base' ? `colour-${action.id}` : null
  const history = commit(state.history, end.doc, key)
  if (history === state.history && end.selectedId === state.selectedId && end.harmony === state.harmony && end.variation === state.variation) return state
  return { history, selectedId: end.selectedId, harmony: end.harmony, variation: end.variation }
}
