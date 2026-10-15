import { todayIso } from './invoice.ts'
import { invoiceSaveSchema, type InvoiceSave } from './invoiceSave.ts'
import { openInvoiceWorkspace, type InvoiceState } from './invoiceState.ts'
import { newId } from './ids.ts'
import { loadMemory } from './memoryStore.ts'
import { documentStorage } from './storage.ts'
import { duplicateContent, latestDraft, newInvoiceContent, savedInvoice } from './projectMemory.ts'

// The invoice document of a project, through the document storage. It is only read now, for an invoice saved before the project had a memory (its `content`); how the
// workspace was arranged is no longer kept. The invoices themselves, the business and the clients are what the project remembers (`memoryStore.ts`), and only once the
// founder confirmed them. Every call is asynchronous.
export { invoiceSaveSchema, type InvoiceSave } from './invoiceSave.ts'

export async function loadInvoice(projectId: string): Promise<InvoiceSave | null> {
  const parsed = invoiceSaveSchema.safeParse(await documentStorage().read(projectId, 'invoice'))
  return parsed.success ? parsed.data : null
}

export function clearInvoice(projectId: string): Promise<void> {
  return documentStorage().remove(projectId, 'invoice')
}

// The invoice workspace for a project. It picks up where the founder left off: the invoice confirmed most recently that has not been
// exported. Failing that, an invoice saved before the project had a memory is still opened, and otherwise it is a new invoice.
export async function openInvoiceForProject(projectId: string, today: string = todayIso()): Promise<InvoiceState> {
  const [memory, legacy] = await Promise.all([loadMemory(projectId), loadInvoice(projectId)])
  const draft = latestDraft(memory)
  if (draft) return openInvoiceWorkspace(draft.content, draft.id)
  if (legacy?.content && memory.invoices.length === 0) return openInvoiceWorkspace(legacy.content)
  return openInvoiceWorkspace(newInvoiceContent(memory, today), newId())
}

// Another invoice in the same workspace.
export async function openNewInvoice(projectId: string, today: string = todayIso()): Promise<InvoiceState> {
  return openInvoiceWorkspace(newInvoiceContent(await loadMemory(projectId), today), newId())
}

export async function openSavedInvoice(projectId: string, invoiceId: string): Promise<InvoiceState | null> {
  const invoice = savedInvoice(await loadMemory(projectId), invoiceId)
  return invoice ? openInvoiceWorkspace(invoice.content, invoice.id) : null
}

// A new invoice made from a saved one, with the next number and today's date.
export async function duplicateInvoice(projectId: string, invoiceId: string, today: string = todayIso()): Promise<InvoiceState | null> {
  const memory = await loadMemory(projectId)
  const invoice = savedInvoice(memory, invoiceId)
  return invoice ? openInvoiceWorkspace(duplicateContent(memory, invoice.content, today), newId()) : null
}
