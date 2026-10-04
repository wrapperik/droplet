import { emptyBusiness, newContent, nextNumber, type Business, type Client, type InvoiceContent } from './invoice.ts'
import type { ProjectMemory, SavedClient, SavedInvoice } from './memorySave.ts'

// The sums on what a project remembers. Pure functions: each takes the memory and gives back a new one, and nothing here reads or
// writes storage, so every rule can be tested. The interface only calls these after the founder confirmed.

export const emptyMemory = (): ProjectMemory => ({ business: null, clients: [], invoices: [] })

const trimmed = <T extends Record<string, string>>(record: T) => JSON.stringify(Object.entries(record).map(([key, value]) => [key, value.trim()]))
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// What confirming would do with something: add it, change what is remembered, or nothing (it is already remembered as it is).
export type MemoryStatus = 'none' | 'new' | 'updated' | 'same'

export function businessStatus(memory: ProjectMemory, business: Business): MemoryStatus {
  if (business.name.trim() === '') return 'none'
  if (!memory.business) return 'new'
  return trimmed(memory.business.details) === trimmed(business) ? 'same' : 'updated'
}

export const findClient = (memory: ProjectMemory, name: string): SavedClient | undefined =>
  name.trim() === '' ? undefined : memory.clients.find((saved) => sameName(saved.client.name, name))

export function clientStatus(memory: ProjectMemory, client: Client): MemoryStatus {
  if (client.name.trim() === '') return 'none'
  const saved = findClient(memory, client.name)
  if (!saved) return 'new'
  return trimmed(saved.client) === trimmed(client) ? 'same' : 'updated'
}

export const withBusiness = (memory: ProjectMemory, business: Business, now: string): ProjectMemory => ({
  ...memory,
  business: { details: business, confirmedAt: now },
})

// A client with the name of one already remembered replaces it, so the same client is never remembered twice.
export function withClient(memory: ProjectMemory, client: Client, now: string, newId: string): ProjectMemory {
  const existing = findClient(memory, client.name)
  if (!existing) return { ...memory, clients: [...memory.clients, { id: newId, client, confirmedAt: now }] }
  return { ...memory, clients: memory.clients.map((saved) => (saved.id === existing.id ? { ...saved, client, confirmedAt: now } : saved)) }
}

// An invoice confirmed again is a revision of the same invoice: it keeps its place, its id and its number is whatever it says.
export function withInvoice(memory: ProjectMemory, id: string, content: InvoiceContent, now: string): ProjectMemory {
  const existing = memory.invoices.find((invoice) => invoice.id === id)
  if (!existing) return { ...memory, invoices: [...memory.invoices, { id, content, revision: 1, updatedAt: now }] }
  return { ...memory, invoices: memory.invoices.map((invoice) => (invoice.id === id ? { ...invoice, content, revision: invoice.revision + 1, updatedAt: now } : invoice)) }
}

export function markExported(memory: ProjectMemory, id: string, now: string): ProjectMemory {
  if (!memory.invoices.some((invoice) => invoice.id === id)) return memory
  return { ...memory, invoices: memory.invoices.map((invoice) => (invoice.id === id ? { ...invoice, exportedAt: now } : invoice)) }
}

export const forgetBusiness = (memory: ProjectMemory): ProjectMemory => ({ ...memory, business: null })
export const forgetClient = (memory: ProjectMemory, id: string): ProjectMemory => ({ ...memory, clients: memory.clients.filter((saved) => saved.id !== id) })
export const forgetInvoice = (memory: ProjectMemory, id: string): ProjectMemory => ({ ...memory, invoices: memory.invoices.filter((invoice) => invoice.id !== id) })

export const savedInvoice = (memory: ProjectMemory, id: string): SavedInvoice | undefined => memory.invoices.find((invoice) => invoice.id === id)

// Changed after it was last exported, so what the client has is no longer what is here.
export const isRevisedSinceExport = (invoice: SavedInvoice) => invoice.exportedAt !== undefined && invoice.updatedAt > invoice.exportedAt

// The invoice to pick up where it was left: the one confirmed most recently that has not been exported yet.
export function latestDraft(memory: ProjectMemory): SavedInvoice | undefined {
  return [...memory.invoices].filter((invoice) => invoice.exportedAt === undefined).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

// The numbers of the other invoices, which a number must not repeat.
export const numbersInUse = (memory: ProjectMemory, exceptId?: string) =>
  memory.invoices.filter((invoice) => invoice.id !== exceptId).map((invoice) => invoice.content.details.number.trim()).filter(Boolean)

const prefixOf = (number: string) => /^(.*?)\d+$/.exec(number.trim())?.[1] ?? null
const suffixOf = (number: string) => Number(/(\d+)$/.exec(number.trim())?.[1] ?? NaN)

// The number for the next invoice: the one after the highest used in the style of the invoice confirmed most recently, so a founder
// who numbers "2026/12" carries on from there. It is never one that is already used.
export function nextInvoiceNumber(memory: ProjectMemory): string {
  const used = new Set(numbersInUse(memory))
  const latest = [...memory.invoices].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  let candidate = 'INV-0001'
  if (latest) {
    const prefix = prefixOf(latest.content.details.number)
    const sameStyle = memory.invoices.map((invoice) => invoice.content.details.number).filter((number) => prefixOf(number) === prefix && prefix !== null)
    const highest = sameStyle.sort((a, b) => suffixOf(b) - suffixOf(a))[0]
    candidate = nextNumber(highest ?? latest.content.details.number)
  }
  while (used.has(candidate)) candidate = nextNumber(candidate)
  return candidate
}

// A new invoice: dated today, with the next number, and the founder's business already on it, so it is never typed twice.
export const newInvoiceContent = (memory: ProjectMemory, today: string): InvoiceContent => ({
  ...newContent(today, nextInvoiceNumber(memory)),
  business: memory.business?.details ?? emptyBusiness(),
})

// An invoice started from another: the same client, lines and terms, with a new number and today's date.
export const duplicateContent = (memory: ProjectMemory, from: InvoiceContent, today: string): InvoiceContent => ({
  ...from,
  details: { ...from.details, number: nextInvoiceNumber(memory), issueDate: today },
})
