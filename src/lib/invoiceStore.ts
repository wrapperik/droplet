import type { ArrangementSave } from './arrangement.ts'
import { todayIso } from './invoice.ts'
import { invoiceSaveSchema, type InvoiceSave } from './invoiceSave.ts'
import { openInvoiceWorkspace, type InvoiceState } from './invoiceState.ts'
import { newId } from './ids.ts'
import { loadMemory } from './memoryStore.ts'
import { duplicateContent, latestDraft, newInvoiceContent, savedInvoice } from './projectMemory.ts'

// How the invoice workspace is arranged, kept per project in this browser. The invoices themselves, the business and the clients are
// not here: they are what the project remembers (`memoryStore.ts`), and only once the founder confirmed them.
export { invoiceSaveSchema, type InvoiceSave } from './invoiceSave.ts'

const keyFor = (projectId: string) => `droplet-project-${projectId}-invoice`

export function loadInvoice(projectId: string): InvoiceSave | null {
  try {
    const raw = window.localStorage.getItem(keyFor(projectId))
    if (!raw) return null
    const parsed = invoiceSaveSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// Returns null when the browser refused to store it, so the interface can say so honestly.
export function saveArrangement(projectId: string, arrangement: ArrangementSave): InvoiceSave | null {
  const save: InvoiceSave = {
    layout: arrangement.layout,
    ...(arrangement.tools ? { tools: arrangement.tools } : {}),
    ...(arrangement.expanded ? { expanded: arrangement.expanded } : {}),
    ...(arrangement.hidden ? { hidden: arrangement.hidden } : {}),
    savedAt: new Date().toISOString(),
  }
  try {
    window.localStorage.setItem(keyFor(projectId), JSON.stringify(save))
    return save
  } catch {
    return null
  }
}

export function clearInvoice(projectId: string) {
  try {
    window.localStorage.removeItem(keyFor(projectId))
  } catch {
    // Nothing to clear.
  }
}

// The invoice workspace for a project. It picks up where the founder left off: the invoice confirmed most recently that has not been
// exported. Failing that, an invoice saved before the project had a memory is still opened, and otherwise it is a new invoice.
export function openInvoiceForProject(projectId: string, today: string = todayIso()): InvoiceState {
  const memory = loadMemory(projectId)
  const arrangement = loadInvoice(projectId)
  const draft = latestDraft(memory)
  if (draft) return openInvoiceWorkspace(draft.content, arrangement, draft.id)
  if (arrangement?.content && memory.invoices.length === 0) return openInvoiceWorkspace(arrangement.content, arrangement)
  return openInvoiceWorkspace(newInvoiceContent(memory, today), arrangement, newId())
}

// Another invoice in the same workspace, keeping how it is arranged right now.
export function openNewInvoice(projectId: string, arrangement: ArrangementSave, today: string = todayIso()): InvoiceState {
  return openInvoiceWorkspace(newInvoiceContent(loadMemory(projectId), today), arrangement, newId())
}

export function openSavedInvoice(projectId: string, invoiceId: string, arrangement: ArrangementSave): InvoiceState | null {
  const invoice = savedInvoice(loadMemory(projectId), invoiceId)
  return invoice ? openInvoiceWorkspace(invoice.content, arrangement, invoice.id) : null
}

// A new invoice made from a saved one, with the next number and today's date.
export function duplicateInvoice(projectId: string, invoiceId: string, arrangement: ArrangementSave, today: string = todayIso()): InvoiceState | null {
  const memory = loadMemory(projectId)
  const invoice = savedInvoice(memory, invoiceId)
  return invoice ? openInvoiceWorkspace(duplicateContent(memory, invoice.content, today), arrangement, newId()) : null
}
