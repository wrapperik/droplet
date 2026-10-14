import type { AssetStatus } from './mockProjects.ts'
import { FACT_INFO, FACT_KEYS, type FactKey } from './facts.ts'
import { computeTotals, type Client } from './invoice.ts'
import { formatRand } from './money.ts'
import type { BoardSave } from './boardSave.ts'
import type { ProjectMemory, SavedInvoice } from './memorySave.ts'
import { COLOUR_ROLES, pairResult, resolveRoles, type ColourRole } from './palette.ts'
import type { PaletteSave } from './paletteSave.ts'
import type { LogoSave } from './logoSave.ts'
import { checkInvoice } from './invoiceReadiness.ts'
import { currentFacts, isRevisedSinceExport, numbersInUse } from './projectMemory.ts'

// What the founder has made for a project, and where each thing stands, worked out in code from what is saved. It is the Library screen's whole
// content and the short account of it the composer is given. Nothing here reads storage or the screen, so every rule can be tested. No private
// detail goes into it that the screen does not need: it holds whether an address is filled in, never the address.

export const LIBRARY_SECTIONS = ['business', 'brand', 'logo', 'ideas', 'invoices', 'clients', 'details', 'notes'] as const
export type LibrarySection = (typeof LIBRARY_SECTIONS)[number]

export const SECTION_TITLES: Record<LibrarySection, string> = {
  business: 'Business',
  brand: 'Brand',
  logo: 'Logo',
  ideas: 'Ideas',
  invoices: 'Invoices',
  clients: 'Clients',
  details: 'Business details',
  notes: 'Droplet’s notes',
}

// What can be done with an item. The screen draws a button for each, in this order, and does it through the same code the workspaces use.
export type LibraryActionId =
  | 'open'
  | 'change'
  | 'forget'
  | 'export'
  | 'export_png'
  | 'export_pdf'
  | 'copy_hex'
  | 'copy'
  | 'new_invoice'
  | 'edit'
  | 'make_brief'
  | 'handoff'

type Base = {
  // Stable for the same thing: "business", "brand", "invoice:<id>", "client:<id>".
  id: string
  section: LibrarySection
  title: string
  // Where it stands: a finished thing is resolved, one still to do is outstanding (never orange).
  status: AssetStatus
  // In words, beside the mark: "Saved 8 October", "Not exported yet".
  statusLabel: string
  // When it was last saved or confirmed.
  date: string | null
  actions: LibraryActionId[]
}

export type BusinessItem = Base & {
  section: 'business'
  name: string | null
  offer: string | null
  facts: { key: FactKey; label: string; value: string }[]
}

export type BrandItem = Base & {
  section: 'brand'
  swatches: { hex: string; role: ColourRole | null }[]
  // Text on background, the pair that matters: worked out in code.
  contrast: { text: string; background: string; ratio: string; passes: boolean; verdict: string }
  exportedAt: string | null
}

export type LogoItem = Base & {
  section: 'logo'
  brief: string | null
  // The logo the founder brought back from another tool, if they have. Drawn as an image; never sent to the composer.
  file: { name: string; kind: 'png' | 'svg'; dataUrl: string; size: number } | null
}

export type IdeasItem = Base & {
  section: 'ideas'
  notes: number
  frames: number
  other: number
  // The items, for the small picture. The screen draws it from the same marks the PNG and the PDF are made from.
  items: BoardSave['items']
  exportedAt: string | null
}

export type InvoiceItem = Base & {
  section: 'invoices'
  invoiceId: string
  number: string
  client: string
  // Worked out from the lines each time, never stored.
  total: string
  kind: 'invoice' | 'quote'
  exportedAt: string | null
  changedSinceExport: boolean
  // Nothing required is missing, so it can be exported.
  ready: boolean
}

export type ClientItem = Base & { section: 'clients'; clientId: string; hasAddress: boolean }

export type DetailsItem = Base & {
  section: 'details'
  name: string
  // Which are filled in, never what they say.
  filled: { label: string; filled: boolean }[]
}

export type NotesItem = Base & { section: 'notes'; workspaces: { id: string; title: string; lines: number; digest: boolean }[] }

export type LibraryItem = BusinessItem | BrandItem | LogoItem | IdeasItem | InvoiceItem | ClientItem | DetailsItem | NotesItem

export type LibrarySectionView = {
  id: LibrarySection
  title: string
  items: LibraryItem[]
  // What an empty section says it is for, and what makes it.
  empty: { text: string; action: 'open_brand' | 'open_board' | 'open_invoice' | 'make_brief' | null; actionLabel: string | null }
}

export type Library = { sections: LibrarySectionView[]; items: LibraryItem[] }

const longDate = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}
const shortDate = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date)
}

// What the library needs of Droplet's notes: how many lines each workspace has kept, and whether it has a digest. Written structurally so the library
// does not pull the notes' storage into the server's code.
export type NotesInput = Partial<Record<'board' | 'brand' | 'invoice', { index: unknown[]; indexedAt: string; digest: unknown | null }>>

export type LibraryInput = {
  palette: PaletteSave | null
  board: BoardSave | null
  memory: ProjectMemory
  notes: NotesInput
  // The logo brought back from another tool, if there is one. Absent in a caller that does not need it.
  logo?: LogoSave | null
}

const filledIn = (value: string) => value.trim() !== ''

function businessItem(memory: ProjectMemory): BusinessItem | null {
  const facts = currentFacts(memory)
  const name = facts['business.name'] ?? null
  const offer = facts['business.offer'] ?? null
  const rest = FACT_KEYS.filter((key) => key !== 'business.name' && key !== 'business.offer' && facts[key] !== undefined).map((key) => ({ key, label: FACT_INFO[key].label, value: facts[key]! }))
  if (!name && !offer && rest.length === 0) return null
  const date = memory.idea?.confirmedAt ?? null
  return {
    id: 'business',
    section: 'business',
    title: name ?? 'No name chosen yet',
    status: name ? 'resolved' : 'outstanding',
    statusLabel: name ? (date ? `Remembered ${longDate(date)}` : 'Remembered') : 'The name is still to choose',
    date,
    name,
    offer,
    facts: rest,
    actions: name || offer ? ['change', 'forget'] : ['change'],
  }
}

function brandItem(palette: PaletteSave | null): BrandItem | null {
  if (!palette) return null
  const roles = resolveRoles(palette.blocks)
  const pair = pairResult(roles.text.hex, roles.background.hex)
  const passes = pair.level !== 'fail'
  return {
    id: 'brand',
    section: 'brand',
    title: 'Colour palette',
    status: 'resolved',
    statusLabel: `Saved ${longDate(palette.savedAt)}`,
    date: palette.savedAt,
    swatches: palette.blocks.map((block) => ({ hex: block.hex, role: block.role ?? null })),
    contrast: { text: roles.text.hex, background: roles.background.hex, ratio: `${pair.ratio.toFixed(1)}:1`, passes, verdict: passes ? `Passes ${pair.level}` : 'Fails AA' },
    exportedAt: palette.exportedAt ?? null,
    actions: ['open', 'export', 'copy_hex'],
  }
}

function logoItem(memory: ProjectMemory, logo: LogoSave | null): LogoItem {
  const brief = currentFacts(memory)['logo.status'] ?? null
  if (logo) {
    return {
      id: 'logo',
      section: 'logo',
      title: 'Logo',
      status: 'resolved',
      statusLabel: `Added ${longDate(logo.savedAt)}`,
      date: logo.savedAt,
      brief,
      file: { name: logo.name, kind: logo.kind, dataUrl: logo.dataUrl, size: logo.size },
      actions: ['handoff'],
    }
  }
  return {
    id: 'logo',
    section: 'logo',
    title: 'Logo',
    // Droplet cannot make one, so until the founder brings one back from another tool it is outstanding here.
    status: 'outstanding',
    statusLabel: 'Made outside Droplet',
    date: null,
    brief,
    file: null,
    actions: ['handoff', 'make_brief'],
  }
}

function ideasItem(board: BoardSave | null): IdeasItem | null {
  if (!board || board.items.length === 0) return null
  const count = (kind: string) => board.items.filter((item) => item.kind === kind).length
  const notes = count('note')
  const frames = count('frame')
  return {
    id: 'ideas',
    section: 'ideas',
    title: 'Business idea board',
    status: 'resolved',
    statusLabel: `Saved ${longDate(board.savedAt)}`,
    date: board.savedAt,
    notes,
    frames,
    other: board.items.length - notes - frames,
    items: board.items,
    exportedAt: board.exportedAt ?? null,
    actions: ['open', 'export_png', 'export_pdf'],
  }
}

export const invoiceTotal = (invoice: SavedInvoice) => formatRand(computeTotals(invoice.content.lines, invoice.content.vatRegistered).totalCents)

function invoiceItem(invoice: SavedInvoice, memory: ProjectMemory): InvoiceItem {
  const changed = isRevisedSinceExport(invoice)
  const exported = invoice.exportedAt !== undefined
  const word = invoice.content.details.kind === 'quote' ? 'Quote' : 'Invoice'
  return {
    id: `invoice:${invoice.id}`,
    section: 'invoices',
    title: `${word} ${invoice.content.details.number || '(no number)'}`,
    status: exported && !changed ? 'resolved' : 'outstanding',
    statusLabel: changed ? 'Changed since export' : exported ? `Exported ${shortDate(invoice.exportedAt!)}` : 'Not exported yet',
    date: invoice.updatedAt,
    invoiceId: invoice.id,
    number: invoice.content.details.number,
    client: invoice.content.client.name,
    total: invoiceTotal(invoice),
    kind: invoice.content.details.kind,
    exportedAt: invoice.exportedAt ?? null,
    changedSinceExport: changed,
    ready: checkInvoice(invoice.content, { usedNumbers: numbersInUse(memory, invoice.id) }).ready,
    actions: ['open', 'copy', 'export', 'forget'],
  }
}

function clientItem(saved: ProjectMemory['clients'][number]): ClientItem {
  const client: Client = saved.client
  return {
    id: `client:${saved.id}`,
    section: 'clients',
    title: client.name,
    status: 'resolved',
    statusLabel: filledIn(client.address) ? 'Address filled in' : 'No address yet',
    date: saved.confirmedAt,
    clientId: saved.id,
    hasAddress: filledIn(client.address),
    actions: ['new_invoice', 'forget'],
  }
}

function detailsItem(memory: ProjectMemory): DetailsItem | null {
  const business = memory.business?.details
  if (!business) return null
  const filled = [
    { label: 'Address', filled: filledIn(business.address) },
    { label: 'Email or phone', filled: filledIn(business.email) || filledIn(business.phone) },
    { label: 'VAT number', filled: filledIn(business.vatNumber) },
    { label: 'Bank details', filled: filledIn(business.accountNumber) && filledIn(business.bankName) },
  ]
  return {
    id: 'details',
    section: 'details',
    title: business.name || 'Your business',
    status: 'resolved',
    statusLabel: `Remembered ${longDate(memory.business!.confirmedAt)}`,
    date: memory.business!.confirmedAt,
    name: business.name,
    filled,
    actions: ['edit'],
  }
}

const NOTE_TITLES = { board: 'Business idea board', brand: 'Brand', invoice: 'Invoices' } as const

function notesItem(notes: NotesInput): NotesItem | null {
  const workspaces = (['board', 'brand', 'invoice'] as const).flatMap((id) => (notes[id] ? [{ id, title: NOTE_TITLES[id], lines: notes[id]!.index.length, digest: notes[id]!.digest !== null }] : []))
  if (workspaces.length === 0) return null
  const latest = (['board', 'brand', 'invoice'] as const).map((id) => notes[id]?.indexedAt ?? '').sort().reverse()[0] || null
  return {
    id: 'notes',
    section: 'notes',
    title: 'What Droplet keeps in mind',
    status: 'resolved',
    statusLabel: latest ? `Updated ${longDate(latest)}` : 'Kept',
    date: latest,
    workspaces,
    // The notes are changed in their own list, so the item itself has no button.
    actions: [],
  }
}

const EMPTY: Record<LibrarySection, LibrarySectionView['empty']> = {
  business: { text: 'Nothing is remembered about the business yet. Choose a name on the board, or tell Droplet about it in the chat.', action: 'open_board', actionLabel: 'Open the board' },
  brand: { text: 'No palette is saved. Build one and save it, and it is kept here.', action: 'open_brand', actionLabel: 'Build the brand' },
  logo: { text: '', action: null, actionLabel: null },
  ideas: { text: 'The board is empty or not saved. Put ideas on it and save, and it is kept here.', action: 'open_board', actionLabel: 'Open the board' },
  invoices: { text: 'No invoice is confirmed yet. Make one and confirm it, and it is kept here with its number.', action: 'open_invoice', actionLabel: 'Make an invoice' },
  clients: { text: 'No client is remembered. A client is remembered when you confirm an invoice with their details on it.', action: 'open_invoice', actionLabel: 'Make an invoice' },
  details: { text: 'Your business details are entered once, in the invoice, and remembered when you confirm.', action: 'open_invoice', actionLabel: 'Open the invoice' },
  notes: { text: 'Droplet writes notes on a workspace after you save it, unless you switched that off in the project brief.', action: null, actionLabel: null },
}

// Everything the library holds, in the order the founder meets it: the business, then what is made for it, then what depends on that.
export function libraryOf(input: LibraryInput): Library {
  const { palette, board, memory, notes, logo = null } = input
  const invoices = [...memory.invoices].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((invoice) => invoiceItem(invoice, memory))
  const clients = [...memory.clients].sort((a, b) => a.client.name.localeCompare(b.client.name)).map(clientItem)
  const groups: Record<LibrarySection, LibraryItem[]> = {
    business: [businessItem(memory)].flatMap((item) => (item ? [item] : [])),
    brand: [brandItem(palette)].flatMap((item) => (item ? [item] : [])),
    logo: [logoItem(memory, logo)],
    ideas: [ideasItem(board)].flatMap((item) => (item ? [item] : [])),
    invoices,
    clients,
    details: [detailsItem(memory)].flatMap((item) => (item ? [item] : [])),
    notes: [notesItem(notes)].flatMap((item) => (item ? [item] : [])),
  }
  const sections = LIBRARY_SECTIONS.map((id) => ({ id, title: SECTION_TITLES[id], items: groups[id], empty: EMPTY[id] }))
  return { sections, items: sections.flatMap((section) => section.items) }
}

export const roleLabel = (role: ColourRole | null) => COLOUR_ROLES.find((entry) => entry.id === role)?.label ?? null

// ---- Finding an invoice by what the founder calls it ----

const plain = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

// "the last invoice", "INV-0007", or a client's name: which saved invoice is meant, or null if none or more than one is. The list is newest first,
// as the library has it. "Last", "latest" and "newest" are the first in it; "first" and "oldest" are the last. A client with several invoices means
// their latest.
export function findInvoice<T extends { number: string; client: string }>(invoices: T[], which: string | undefined): T | null {
  if (invoices.length === 0) return null
  const wanted = plain(which ?? '')
  if (wanted === '' || /\b(last|latest|newest|recent|current)\b/.test(wanted)) return invoices[0]
  if (/\b(first|oldest|earliest)\b/.test(wanted)) return invoices[invoices.length - 1]
  const byNumber = invoices.filter((invoice) => plain(invoice.number) !== '' && wanted.includes(plain(invoice.number)))
  if (byNumber.length === 1) return byNumber[0]
  const byClient = invoices.filter((invoice) => plain(invoice.client) !== '' && (wanted.includes(plain(invoice.client)) || plain(invoice.client).includes(wanted)))
  return byClient[0] ?? null
}
