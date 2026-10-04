import { VAT_RATE_BP, vatOf } from './money.ts'

// What an invoice is, and the sums on it. Everything with one right answer is worked out here in code, in whole cents,
// and never by the model.

// A quote has the same parts as an invoice, so the model holds both. Only the invoice has screens for now.
export type DocKind = 'invoice' | 'quote'

export type TermsId = 'on_receipt' | '7' | '14' | '30' | 'custom'
export const TERMS: { id: TermsId; label: string; days: number | null }[] = [
  { id: 'on_receipt', label: 'Due on receipt', days: 0 },
  { id: '7', label: '7 days', days: 7 },
  { id: '14', label: '14 days', days: 14 },
  { id: '30', label: '30 days', days: 30 },
  { id: 'custom', label: 'A date I choose', days: null },
]

// A line on the invoice. A price of null means no price has been given yet, which is flagged and counts as nothing.
export type Line = { id: number; description: string; quantity: number; unitCents: number | null }

export type Business = {
  name: string
  address: string
  email: string
  phone: string
  vatNumber: string
  accountHolder: string
  bankName: string
  accountNumber: string
  branchCode: string
}

export type Client = {
  name: string
  contact: string
  address: string
  email: string
  vatNumber: string
  // The client's own reference for the job, such as a purchase order number.
  reference: string
}

export type InvoiceDetails = {
  kind: DocKind
  number: string
  // Dates are whole days as YYYY-MM-DD, so there is no time zone to get wrong.
  issueDate: string
  terms: TermsId
  customDueDate: string
  notes: string
}

export type InvoiceContent = {
  details: InvoiceDetails
  business: Business
  client: Client
  lines: Line[]
  // A business that is registered for VAT charges it and issues a tax invoice. One that is not, does neither.
  vatRegistered: boolean
}

export const emptyBusiness = (): Business => ({
  name: '',
  address: '',
  email: '',
  phone: '',
  vatNumber: '',
  accountHolder: '',
  bankName: '',
  accountNumber: '',
  branchCode: '',
})

export const emptyClient = (): Client => ({ name: '', contact: '', address: '', email: '', vatNumber: '', reference: '' })

export const emptyLine = (id: number): Line => ({ id, description: '', quantity: 1, unitCents: null })

// A new invoice: one blank line to start on, dated today, due in 14 days.
export const newContent = (today: string, number = 'INV-0001'): InvoiceContent => ({
  details: { kind: 'invoice', number, issueDate: today, terms: '14', customDueDate: '', notes: '' },
  business: emptyBusiness(),
  client: emptyClient(),
  lines: [emptyLine(1)],
  vatRegistered: false,
})

// Dates

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isIsoDate(text: string): boolean {
  const match = DATE.exec(text)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// Today as YYYY-MM-DD, in the browser's own time zone.
export const todayIso = (now: Date = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

export function addDays(iso: string, days: number): string {
  const match = DATE.exec(iso)!
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days))
  return date.toISOString().slice(0, 10)
}

// When payment is due, or null if it cannot be worked out (no issue date, or a custom date that is not a date).
export function dueDateOf(details: InvoiceDetails): string | null {
  if (details.terms === 'custom') return isIsoDate(details.customDueDate) ? details.customDueDate : null
  if (!isIsoDate(details.issueDate)) return null
  return addDays(details.issueDate, TERMS.find((terms) => terms.id === details.terms)!.days!)
}

const longDate = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

// "2026-10-04" becomes "4 October 2026". Anything that is not a date comes back as it was.
export function formatDate(iso: string): string {
  return isIsoDate(iso) ? longDate.format(new Date(`${iso}T00:00:00Z`)) : iso
}

// Lines

// A quantity is more than nothing and has at most two decimals.
export const quantityIsValid = (quantity: number) => Number.isFinite(quantity) && quantity > 0 && Math.round(quantity * 100) / 100 === quantity

export type LineProblem = 'description' | 'quantity' | 'price'

// What a line still needs, in the order it is read. A line that is completely blank has all three.
export function lineProblems(line: Line): LineProblem[] {
  const problems: LineProblem[] = []
  if (line.description.trim() === '') problems.push('description')
  if (!quantityIsValid(line.quantity)) problems.push('quantity')
  if (line.unitCents === null) problems.push('price')
  return problems
}

export const lineIsBlank = (line: Line) => line.description.trim() === '' && line.unitCents === null

// The amount for a line, rounded to the cent, or null if it has no price yet.
export const lineAmount = (line: Line): number | null =>
  line.unitCents === null || !quantityIsValid(line.quantity) ? null : Math.round(line.quantity * line.unitCents)

// Totals

export type Totals = {
  amounts: Record<number, number | null>
  subtotalCents: number
  // Null when the business does not charge VAT.
  vatCents: number | null
  totalCents: number
  // How many lines are counted as nothing because they have no price or no quantity.
  unpriced: number
}

export function computeTotals(lines: Line[], vatRegistered: boolean, rateBp: number = VAT_RATE_BP): Totals {
  const amounts: Record<number, number | null> = {}
  let subtotalCents = 0
  let unpriced = 0
  for (const line of lines) {
    const amount = lineAmount(line)
    amounts[line.id] = amount
    if (amount === null) {
      if (!lineIsBlank(line)) unpriced += 1
    } else subtotalCents += amount
  }
  const vatCents = vatRegistered ? vatOf(subtotalCents, rateBp) : null
  return { amounts, subtotalCents, vatCents, totalCents: subtotalCents + (vatCents ?? 0), unpriced }
}

export const nextLineId = (lines: Line[]) => lines.reduce((highest, line) => Math.max(highest, line.id), 0) + 1

// The next invoice number after one such as "INV-0007": the number part goes up by one and keeps its length.
export function nextNumber(number: string): string {
  const match = /^(.*?)(\d+)$/.exec(number.trim())
  if (!match) return `${number.trim() || 'INV'}-0001`
  return `${match[1]}${String(Number(match[2]) + 1).padStart(match[2].length, '0')}`
}
