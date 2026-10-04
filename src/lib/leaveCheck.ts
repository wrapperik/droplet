import type { BoardSave } from './boardSave.ts'
import { docOf as boardDocOf, isBoardUnsaved, sameItems, sameSummary, type BoardState } from './boardState.ts'
import { isInvoiceUnsaved, invoiceDocOf, type InvoiceState } from './invoiceState.ts'
import type { InvoiceSave } from './invoiceSave.ts'
import type { ProjectMemory } from './memorySave.ts'
import { savedInvoice } from './projectMemory.ts'
import type { PaletteSave } from './projectStore.ts'
import { docOf, isUnsaved, sameBlocks, type WorkspaceState } from './workspaceState.ts'

// Whether a workspace holds work that closing it would lose. A workspace nobody has touched holds none, even though nothing has been
// saved from it: the starter palette and a fresh invoice are not the founder's work.
//
// What is saved is compared against what is there. With nothing saved, what is there is compared against how the workspace began,
// which is the oldest step of its history (or itself, if it has had no steps).

export function paletteHasChanges(state: WorkspaceState, saved: PaletteSave | null): boolean {
  if (saved) return isUnsaved(docOf(state), saved)
  const began = state.history.past[0] ?? state.history.present
  return !sameBlocks(began.blocks, state.history.present.blocks)
}

export function invoiceHasChanges(state: InvoiceState, memory: ProjectMemory, arrangement: InvoiceSave | null): boolean {
  const doc = invoiceDocOf(state)
  const saved = savedInvoice(memory, doc.invoiceId)
  if (saved) return isInvoiceUnsaved(doc, saved, arrangement)
  const began = state.history.past[0] ?? doc
  return JSON.stringify(began.content) !== JSON.stringify(doc.content)
}

export function boardHasChanges(state: BoardState, saved: BoardSave | null): boolean {
  if (saved) return isBoardUnsaved(boardDocOf(state), saved)
  const began = state.history.past[0] ?? state.history.present
  return !sameItems(began.items, state.history.present.items) || !sameSummary(began.summary, state.history.present.summary)
}
