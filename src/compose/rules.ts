import { openWorkspace } from '../lib/workspaceState.ts'
import { applyTurnActions } from './applyActions.ts'
import { stateOfSnapshot } from './snapshot.ts'
import { applyInvoiceTurnActions } from './invoiceActions.ts'
import type { InvoiceSnapshot } from './invoiceSpec.ts'
import { stateOfInvoiceSnapshot } from './invoiceSnapshot.ts'
import { isInvoiceAction, type AnyTurn, type ComposeRequest, type InvoiceTurn, type Turn, type WorkspaceSnapshot } from './spec.ts'

// Business rules for a turn, checked in code after the shape is right. The actions are tried against the workspace
// the founder is looking at, through the same code that will apply them, so anything that could not be done is
// caught here, with a reason written to be sent back to the model if it has to try again.

export function checkTurn(turn: Turn, workspace?: WorkspaceSnapshot): string[] {
  if (turn.actions.length === 0) return []

  // Only a brand turn touches the workspace. Anything else is a conversation.
  if (turn.task !== 'brand') {
    return [`Only a brand task may include actions. Leave actions empty for the task "${turn.task}", and put your answer in the message.`]
  }

  const result = applyTurnActions({
    base: workspace ? stateOfSnapshot(workspace) : null,
    open: (blocks) => openWorkspace(blocks),
    actions: turn.actions,
    env: { layout: workspace?.layout ?? [], heights: {} },
  })
  return result.skipped.map((skipped) => `Action ${skipped.position + 1} (${skipped.action.type}): ${skipped.reason}`)
}

// What the founder wrote in this request and the earlier ones: the only place a price may come from.
export const founderTextOf = (request: Pick<ComposeRequest, 'intent' | 'history'>): string[] => [
  request.intent,
  ...(request.history ?? []).filter((message) => message.role === 'founder').map((message) => message.text),
]

// The same checks for a reply about the invoice: the actions are tried against the invoice the founder is looking at, through the
// same code that will apply them, including the rule that a price must be one the founder wrote.
export function checkInvoiceTurn(turn: InvoiceTurn, invoice: InvoiceSnapshot | undefined, founderText: string[]): string[] {
  if (turn.actions.length === 0) return []
  if (turn.task !== 'invoice') {
    return [`Only an invoice task may include actions on the invoice. Leave actions empty for the task "${turn.task}", and put your answer in the message.`]
  }
  if (!invoice) return ['There is no invoice open to act on. Leave actions empty.']
  const result = applyInvoiceTurnActions({
    base: stateOfInvoiceSnapshot(invoice),
    actions: turn.actions,
    clients: invoice.savedClients.map((name) => ({ name })),
    founderText,
  })
  return result.skipped.map((skipped) => `Action ${skipped.position + 1} (${skipped.action.type}): ${skipped.reason}`)
}

// A reply checked for whichever workspace the request was about: the invoice, or the palette.
export function checkTurnFor(turn: AnyTurn, request: ComposeRequest): string[] {
  if (request.view === 'invoice') return checkInvoiceTurn(turn as InvoiceTurn, request.invoice, founderTextOf(request))
  // An action for the invoice has no place on the palette workspace, or when no workspace is open.
  if (turn.actions.some(isInvoiceAction)) return ['Those actions are for the invoice, which is not the workspace on screen. Leave them out.']
  return checkTurn(turn as Turn, request.workspace)
}
