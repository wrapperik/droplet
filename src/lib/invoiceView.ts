import { computeTotals, dueDateOf, formatDate, lineAmount, lineIsBlank, lineProblems, type InvoiceContent } from './invoice.ts'
import { VAT_RATE_BP, formatRand, percentLabel } from './money.ts'

// An invoice as it is read: every string the document shows, worked out once, so the page on screen and the PDF are made from
// the same words and cannot drift apart. A part that is not filled in yet shows a placeholder, marked, so the page looks like an
// invoice from the first moment and says what is still to come.

export type Text = { text: string; placeholder?: boolean }

const filled = (value: string, placeholder: string): Text => (value.trim() ? { text: value.trim() } : { text: placeholder, placeholder: true })
const linesOf = (value: string) => value.split('\n').map((part) => part.trim()).filter(Boolean)

export type ViewLine = {
  description: Text
  quantity: string
  unit: Text
  amount: Text
  // The line is missing something, so the page marks it.
  incomplete: boolean
}

export type InvoiceView = {
  // "Tax invoice" for a business registered for VAT, "Invoice" for one that is not, and "Quote".
  title: string
  number: Text
  issued: Text
  dueLabel: string
  due: Text
  reference: string | null
  from: Text[]
  to: Text[]
  lines: ViewLine[]
  subtotal: string
  vat: { label: string; amount: string } | null
  totalLabel: string
  total: string
  // How to pay, or null when no bank details are given.
  payment: string[] | null
  notes: string | null
}

// A quantity as it is read: whole numbers without decimals, and others with the decimals they have.
export const quantityText = (quantity: number) => String(Math.round(quantity * 100) / 100)

export function invoiceView(content: InvoiceContent): InvoiceView {
  const { details, business, client, vatRegistered } = content
  const isQuote = details.kind === 'quote'
  const totals = computeTotals(content.lines, vatRegistered)
  const due = dueDateOf(details)

  const from: Text[] = [
    filled(business.name, 'Your business name'),
    ...(business.address.trim() ? linesOf(business.address).map((text) => ({ text })) : [{ text: 'Your address', placeholder: true }]),
    ...[business.email, business.phone].filter((value) => value.trim()).map((text) => ({ text: text.trim() })),
    ...(business.vatNumber.trim() ? [{ text: `VAT number ${business.vatNumber.trim()}` }] : []),
  ]

  const to: Text[] = [
    filled(client.name, 'Client name'),
    ...(client.contact.trim() ? [{ text: client.contact.trim() }] : []),
    ...linesOf(client.address).map((text) => ({ text })),
    ...(client.email.trim() ? [{ text: client.email.trim() }] : []),
    ...(client.vatNumber.trim() ? [{ text: `VAT number ${client.vatNumber.trim()}` }] : []),
  ]

  // Blank lines are not on the page. With none begun, one row of placeholders shows where the first will go.
  const begun = content.lines.filter((line) => !lineIsBlank(line))
  const rows: ViewLine[] =
    begun.length === 0
      ? [{ description: { text: 'Description', placeholder: true }, quantity: '1', unit: { text: '–', placeholder: true }, amount: { text: '–', placeholder: true }, incomplete: false }]
      : begun.map((line) => {
          const amount = lineAmount(line)
          return {
            description: filled(line.description, 'Description'),
            quantity: quantityText(line.quantity),
            unit: line.unitCents === null ? { text: '–', placeholder: true } : { text: formatRand(line.unitCents) },
            amount: amount === null ? { text: '–', placeholder: true } : { text: formatRand(amount) },
            incomplete: lineProblems(line).length > 0,
          }
        })

  const bank = [
    ['Account holder', business.accountHolder],
    ['Bank', business.bankName],
    ['Account number', business.accountNumber],
    ['Branch code', business.branchCode],
  ].filter(([, value]) => value.trim())
  const payment = bank.length === 0 ? null : ['Pay by EFT', ...bank.map(([label, value]) => `${label}: ${value.trim()}`), `Reference: ${details.number.trim() || 'the invoice number'}`]

  return {
    title: isQuote ? 'Quote' : vatRegistered ? 'Tax invoice' : 'Invoice',
    number: filled(details.number, 'Number'),
    issued: details.issueDate ? { text: formatDate(details.issueDate) } : { text: 'Date', placeholder: true },
    dueLabel: isQuote ? 'Valid until' : 'Due',
    due: due ? { text: formatDate(due) } : { text: 'Choose a date', placeholder: true },
    reference: client.reference.trim() || null,
    from,
    to,
    lines: rows,
    subtotal: formatRand(totals.subtotalCents),
    vat: totals.vatCents === null ? null : { label: `VAT (${percentLabel(VAT_RATE_BP)})`, amount: formatRand(totals.vatCents) },
    totalLabel: isQuote ? 'Total' : 'Total due',
    total: formatRand(totals.totalCents),
    payment,
    notes: details.notes.trim() || null,
  }
}
