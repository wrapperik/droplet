import { computeTotals, lineAmount, lineIsBlank } from '../lib/invoice.ts'
import { formatRand } from '../lib/money.ts'
import { stateOfInvoiceSnapshot } from './invoiceSnapshot.ts'
import { invoiceDocOf } from '../lib/invoiceState.ts'
import type { InvoiceSnapshot } from './invoiceSpec.ts'

// What the model is shown about the invoice: what the founder sees, in words and numbers it can reason with. Every amount is the
// app's own sum, in code, so the model quotes them and never works one out. What was not sent (addresses, bank details) is not here.

const plain = (text: string) => text.replace(/[\s ]+/g, ' ')

export function describeInvoice(snapshot: InvoiceSnapshot): Record<string, unknown> {
  const { content } = invoiceDocOf(stateOfInvoiceSnapshot(snapshot))
  const totals = computeTotals(content.lines, content.vatRegistered)
  return {
    today: snapshot.today,
    document: snapshot.kind,
    number: snapshot.number || 'none yet',
    issueDate: snapshot.issueDate || 'none yet',
    terms: snapshot.terms,
    dueDate: snapshot.dueDate || 'not worked out yet',
    note: snapshot.notes || 'none',
    vatRegistered: snapshot.vatRegistered,
    business: {
      name: snapshot.business.name || 'not filled in',
      addressFilledIn: snapshot.business.hasAddress,
      contactFilledIn: snapshot.business.hasContact,
      bankDetailsFilledIn: snapshot.business.hasBankDetails,
    },
    client: { name: snapshot.client.name || 'not filled in', addressFilledIn: snapshot.client.hasAddress },
    savedClients: snapshot.savedClients,
    lines: content.lines.map((line, index) => {
      const amount = lineAmount(line)
      return {
        number: index + 1,
        description: lineIsBlank(line) ? 'blank' : line.description || 'no description yet',
        quantity: line.quantity,
        pricePerUnit: line.unitCents === null ? 'none yet' : plain(formatRand(line.unitCents)),
        amount: amount === null ? 'not counted' : plain(formatRand(amount)),
      }
    }),
    totals: {
      subtotal: plain(formatRand(totals.subtotalCents)),
      vat: totals.vatCents === null ? 'not charged' : plain(formatRand(totals.vatCents)),
      total: plain(formatRand(totals.totalCents)),
      linesNotCounted: totals.unpriced,
    },
    stillNeededBeforeExport: snapshot.needs,
    canUndo: snapshot.canUndo,
    canRedo: snapshot.canRedo,
  }
}
