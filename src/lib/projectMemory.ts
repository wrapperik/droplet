import { factFits, factText, FACT_KEYS, type FactKey } from './facts.ts'
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

// ---- What was decided on the board ----

export type IdeaKind = 'name' | 'offer'
// The most each can hold: a name is what goes on an invoice, an offer is a sentence or two.
export const IDEA_LIMITS: Record<IdeaKind, number> = { name: 80, offer: 300 }

// The words as they would be remembered: all on one line, with the spaces tidied.
export const ideaText = (text: string) => text.replace(/\s+/g, ' ').trim()

// Whether words can be remembered as the name or the offer: there are some, and not more than that can hold.
export const ideaFits = (kind: IdeaKind, text: string) => ideaText(text) !== '' && ideaText(text).length <= IDEA_LIMITS[kind]

// What confirming would do with these words: remember them, replace what is remembered, or nothing since it is already so.
export function ideaStatus(memory: ProjectMemory, kind: IdeaKind, text: string): MemoryStatus {
  if (!ideaFits(kind, text)) return 'none'
  const remembered = memory.idea?.[kind]
  if (!remembered) return 'new'
  return sameName(remembered, ideaText(text)) && remembered === ideaText(text) ? 'same' : 'updated'
}

// The name or the offer remembered. The name is also the business's name on invoices: it is put there, keeping the rest of the business as it is.
export function withIdea(memory: ProjectMemory, kind: IdeaKind, text: string, now: string): ProjectMemory {
  const words = ideaText(text)
  if (!ideaFits(kind, words)) return memory
  const idea = { name: memory.idea?.name ?? null, offer: memory.idea?.offer ?? null, confirmedAt: now, [kind]: words }
  const next: ProjectMemory = { ...memory, idea }
  if (kind !== 'name') return next
  return withBusiness(next, { ...(memory.business?.details ?? emptyBusiness()), name: words }, now)
}

// Forgets the name or the offer that was decided. The business's name on invoices is the founder's to change there, so it stays.
export function forgetIdea(memory: ProjectMemory, kind: IdeaKind): ProjectMemory {
  if (!memory.idea) return memory
  const idea = { ...memory.idea, [kind]: null }
  return { ...memory, idea: idea.name === null && idea.offer === null ? undefined : idea }
}

// ---- Facts about the business ----

// What is remembered for each fact, in the founder's words. The name and the offer are read from what the board decided (`idea`), which is where the
// board's "Use as business name" writes, so the two can never disagree; the rest are kept as facts.
export function currentFacts(memory: ProjectMemory): Partial<Record<FactKey, string>> {
  const found: Partial<Record<FactKey, string>> = {}
  for (const key of FACT_KEYS) {
    const value = key === 'business.name' ? memory.idea?.name : key === 'business.offer' ? memory.idea?.offer : memory.facts?.[key]?.value
    if (value && value.trim() !== '') found[key] = value
  }
  return found
}

// What confirming a fact would do: remember it, replace what is remembered, or nothing since it is already so.
export function factStatus(memory: ProjectMemory, key: FactKey, value: string): MemoryStatus {
  if (!factFits(value)) return 'none'
  const remembered = currentFacts(memory)[key]
  if (remembered === undefined) return 'new'
  return remembered === factText(value) ? 'same' : 'updated'
}

// A fact remembered. The words it had are kept, so a change can be seen and taken back. The name and the offer also go where the board puts them.
export function withFact(memory: ProjectMemory, key: FactKey, value: string, now: string, chatId?: string): ProjectMemory {
  const words = factText(value)
  if (!factFits(words)) return memory
  const before = currentFacts(memory)[key]
  if (before === words) return memory
  const earlier = [...(before ? [{ value: before, replacedAt: now }] : []), ...(memory.facts?.[key]?.earlier ?? [])].slice(0, 5)
  const facts = { ...memory.facts, [key]: { value: words, confirmedAt: now, ...(chatId ? { chatId } : {}), earlier } }
  const next: ProjectMemory = { ...memory, facts }
  if (key !== 'business.name' && key !== 'business.offer') return next
  // The name is held to what a name holds (80), which is shorter than a fact. If it is not remembered there, it is not remembered.
  const placed = withIdea(next, key === 'business.name' ? 'name' : 'offer', words, now)
  return currentFacts(placed)[key] === words ? placed : memory
}

// A fact forgotten. What it had before goes with it.
export function forgetFact(memory: ProjectMemory, key: FactKey): ProjectMemory {
  const { [key]: _gone, ...rest } = memory.facts ?? {}
  const next: ProjectMemory = { ...memory, facts: Object.keys(rest).length > 0 ? rest : undefined }
  return key === 'business.name' ? forgetIdea(next, 'name') : key === 'business.offer' ? forgetIdea(next, 'offer') : next
}

// Whether a switch is on. Both are on unless the founder turned them off.
export const settingOn = (memory: ProjectMemory, setting: 'recall' | 'notes') => memory.settings?.[setting] !== false

export const withSetting = (memory: ProjectMemory, setting: 'recall' | 'notes', on: boolean): ProjectMemory => ({ ...memory, settings: { ...memory.settings, [setting]: on } })

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
