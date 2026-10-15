import { emptyBusiness, emptyClient, dueDateOf, type InvoiceContent } from '../lib/invoice.ts'
import { checkInvoice } from '../lib/invoiceReadiness.ts'
import { canRedoInvoice, canUndoInvoice, invoiceDocOf, openInvoiceWorkspace, type InvoiceState } from '../lib/invoiceState.ts'
import { createHistory } from '../lib/history.ts'
import type { ProjectMemory } from '../lib/memorySave.ts'
import { numbersInUse } from '../lib/projectMemory.ts'
import type { InvoiceSnapshot } from './invoiceSpec.ts'

// The invoice as a plain object: what goes to the model with a request, and what the server rebuilds to check the model's actions
// against. Only what the task needs is sent. The business's address, email, phone and bank details, and the client's, are not: the
// model is told only whether they are filled in.

export function snapshotOfInvoice(state: InvoiceState, memory: ProjectMemory, today: string): InvoiceSnapshot {
  const doc = invoiceDocOf(state)
  const { content } = doc
  const { business, client, details } = content
  return {
    today,
    kind: details.kind,
    number: details.number,
    issueDate: details.issueDate,
    terms: details.terms,
    customDueDate: details.customDueDate,
    dueDate: dueDateOf(details) ?? '',
    notes: details.notes,
    vatRegistered: content.vatRegistered,
    business: {
      name: business.name,
      hasAddress: business.address.trim() !== '',
      hasContact: business.email.trim() !== '' || business.phone.trim() !== '',
      hasBankDetails: business.accountNumber.trim() !== '',
    },
    client: { name: client.name, hasAddress: client.address.trim() !== '' },
    savedClients: memory.clients.map((saved) => saved.client.name).slice(0, 50),
    lines: content.lines.map((line) => ({ description: line.description, quantity: line.quantity, unitCents: line.unitCents })),
    needs: checkInvoice(content, { usedNumbers: numbersInUse(memory, doc.invoiceId) }).required.map((issue) => issue.text).slice(0, 20),
    canUndo: canUndoInvoice(state),
    canRedo: canRedoInvoice(state),
  }
}

// An invoice workspace that looks like the one the snapshot was taken of, as far as the actions can tell: the lines, the client's name,
// the terms and the VAT setting are real, and what was never sent is blank. The history is only as deep as it needs to be for undo and
// redo to be allowed or refused as they were.
export function stateOfInvoiceSnapshot(snapshot: InvoiceSnapshot): InvoiceState {
  const content: InvoiceContent = {
    details: {
      kind: snapshot.kind,
      number: snapshot.number,
      issueDate: snapshot.issueDate,
      terms: snapshot.terms,
      customDueDate: snapshot.customDueDate,
      notes: snapshot.notes,
    },
    business: { ...emptyBusiness(), name: snapshot.business.name },
    client: { ...emptyClient(), name: snapshot.client.name },
    lines: snapshot.lines.map((line, index) => ({ id: index + 1, description: line.description, quantity: line.quantity, unitCents: line.unitCents })),
    vatRegistered: snapshot.vatRegistered,
  }
  const doc = invoiceDocOf(openInvoiceWorkspace(content, 'snapshot'))
  const history = createHistory(doc)
  return { history: { ...history, past: snapshot.canUndo ? [doc] : [], future: snapshot.canRedo ? [doc] : [] } }
}
