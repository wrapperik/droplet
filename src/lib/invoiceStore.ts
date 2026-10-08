import type { ArrangementSave } from './arrangement.ts'
import { todayIso } from './invoice.ts'
import { invoiceSaveSchema, type InvoiceSave } from './invoiceSave.ts'
import { openInvoiceWorkspace, type InvoiceState } from './invoiceState.ts'
import { newId } from './ids.ts'
import { loadMemory } from './memoryStore.ts'
import { documentStorage } from './storage.ts'
import { duplicateContent, latestDraft, newInvoiceContent, savedInvoice } from './projectMemory.ts'

// How the invoice workspace is arranged, kept per project through the document storage. Every call is asynchronous. The invoices themselves, the business and the clients are
// not here: they are what the project remembers (`memoryStore.ts`), and only once the founder confirmed them.
export { invoiceSaveSchema, type InvoiceSave } from './invoiceSave.ts'

export async function loadInvoice(projectId: string): Promise<InvoiceSave | null> {
  const parsed = invoiceSaveSchema.safeParse(await documentStorage().read(projectId, 'invoice'))
  return parsed.success ? parsed.data : null
}

// Null when it could not be stored, so the interface can say so honestly.
export async function saveArrangement(projectId: string, arrangement: ArrangementSave): Promise<InvoiceSave | null> {
  const save: InvoiceSave = {
    layout: arrangement.layout,
    ...(arrangement.tools ? { tools: arrangement.tools } : {}),
    ...(arrangement.expanded ? { expanded: arrangement.expanded } : {}),
    ...(arrangement.hidden ? { hidden: arrangement.hidden } : {}),
    savedAt: new Date().toISOString(),
  }
  return (await documentStorage().write(projectId, 'invoice', save)) ? save : null
}

export function clearInvoice(projectId: string): Promise<void> {
  return documentStorage().remove(projectId, 'invoice')
}

// The invoice workspace for a project. It picks up where the founder left off: the invoice confirmed most recently that has not been
// exported. Failing that, an invoice saved before the project had a memory is still opened, and otherwise it is a new invoice.
export async function openInvoiceForProject(projectId: string, today: string = todayIso()): Promise<InvoiceState> {
  const [memory, arrangement] = await Promise.all([loadMemory(projectId), loadInvoice(projectId)])
  const draft = latestDraft(memory)
  if (draft) return openInvoiceWorkspace(draft.content, arrangement, draft.id)
  if (arrangement?.content && memory.invoices.length === 0) return openInvoiceWorkspace(arrangement.content, arrangement)
  return openInvoiceWorkspace(newInvoiceContent(memory, today), arrangement, newId())
}

// Another invoice in the same workspace, keeping how it is arranged right now.
export async function openNewInvoice(projectId: string, arrangement: ArrangementSave | null, today: string = todayIso()): Promise<InvoiceState> {
  return openInvoiceWorkspace(newInvoiceContent(await loadMemory(projectId), today), arrangement, newId())
}

export async function openSavedInvoice(projectId: string, invoiceId: string, arrangement: ArrangementSave | null): Promise<InvoiceState | null> {
  const invoice = savedInvoice(await loadMemory(projectId), invoiceId)
  return invoice ? openInvoiceWorkspace(invoice.content, arrangement, invoice.id) : null
}

// A new invoice made from a saved one, with the next number and today's date.
export async function duplicateInvoice(projectId: string, invoiceId: string, arrangement: ArrangementSave | null, today: string = todayIso()): Promise<InvoiceState | null> {
  const memory = await loadMemory(projectId)
  const invoice = savedInvoice(memory, invoiceId)
  return invoice ? openInvoiceWorkspace(duplicateContent(memory, invoice.content, today), arrangement, newId()) : null
}
