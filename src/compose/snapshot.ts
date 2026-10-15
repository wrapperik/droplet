import { createHistory } from '../lib/history.ts'
import { canRedoState, canUndoState, docOf, selectedBlock, type WorkspaceState } from '../lib/workspaceState.ts'
import type { PaletteBlock } from '../lib/palette.ts'
import type { PaletteSnapshot, WorkspaceSnapshot } from './spec.ts'

// The workspace as a plain object: what goes to the model with a request, and what the server rebuilds to check the
// model's actions against.

export function snapshotOfState(state: WorkspaceState, saved: WorkspaceSnapshot['saved']): WorkspaceSnapshot {
  const doc = docOf(state)
  return {
    blocks: doc.blocks.map((b) => ({
      id: b.id,
      hex: b.hex,
      ...(b.role ? { role: b.role } : {}),
      ...(b.locked ? { locked: true } : {}),
      ...(b.name ? { name: b.name } : {}),
    })),
    selectedId: selectedBlock(state).id,
    harmony: state.harmony,
    canUndo: canUndoState(state),
    canRedo: canRedoState(state),
    saved,
  }
}

export function stateOfSnapshot(snapshot: WorkspaceSnapshot): WorkspaceState {
  const doc = {
    blocks: snapshot.blocks.map((b) => ({ id: b.id, hex: b.hex, ...(b.role ? { role: b.role } : {}), ...(b.locked ? { locked: true } : {}), ...(b.name ? { name: b.name } : {}) })),
    reasons: {},
  }
  // The history is only as deep as it needs to be for undo and redo to be allowed or refused as they were.
  const history = createHistory(doc)
  return {
    history: { ...history, past: snapshot.canUndo ? [doc] : [], future: snapshot.canRedo ? [doc] : [] },
    selectedId: snapshot.selectedId,
    harmony: snapshot.harmony,
    variation: 0,
  }
}

// The saved palette as the model sees it: the colours and their roles, nothing else.
export const paletteSnapshotOf = (blocks: PaletteBlock[]): PaletteSnapshot => ({
  colours: blocks.map((block) => ({ hex: block.hex, ...(block.role ? { role: block.role } : {}) })),
})
