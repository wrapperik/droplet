import type { InvoiceContent } from './invoice.ts'
import type { ResolvedRoles } from './palette.ts'

// What the downloaded file is called: "Invoice INV-0007 Pretoria Print Works.pdf", with anything a file name cannot hold taken out.
export function invoiceFileName(content: InvoiceContent): string {
  const printable = (text: string) => [...text].map((character) => (character.charCodeAt(0) < 32 ? ' ' : character)).join('')
  const clean = (text: string) => printable(text).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  const word = content.details.kind === 'quote' ? 'Quote' : 'Invoice'
  const parts = [word, clean(content.details.number), clean(content.client.name)].filter(Boolean)
  return `${parts.join(' ')}.pdf`
}

// Makes the invoice PDF and hands it to the browser as a download. The PDF library is large, so it is fetched only now.
export async function exportInvoice(content: InvoiceContent, roles: ResolvedRoles): Promise<boolean> {
  const { downloadInvoice } = await import('../export/invoicePdf.tsx')
  return downloadInvoice(content, roles, invoiceFileName(content))
}
