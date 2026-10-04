import { describe, expect, it } from 'vitest'
import { newContent } from './invoice.ts'
import { invoiceFileName } from './exportInvoice.ts'

const content = (number: string, client: string, kind: 'invoice' | 'quote' = 'invoice') => {
  const base = newContent('2026-10-04', number)
  return { ...base, details: { ...base.details, kind }, client: { ...base.client, name: client } }
}

describe('invoiceFileName', () => {
  it('names the invoice, its number and the client', () => {
    expect(invoiceFileName(content('INV-0007', 'Pretoria Print Works'))).toBe('Invoice INV-0007 Pretoria Print Works.pdf')
  })

  it('names a quote as one', () => {
    expect(invoiceFileName(content('Q-0001', 'Thandi', 'quote'))).toBe('Quote Q-0001 Thandi.pdf')
  })

  it('takes out what a file name cannot hold', () => {
    expect(invoiceFileName(content('2026/12', 'Print: Works*?'))).toBe('Invoice 2026 12 Print Works.pdf')
    expect(invoiceFileName(content('a\\b', 'x"y<z>|'))).toBe('Invoice a b x y z.pdf')
  })

  it('leaves out a part that is empty', () => {
    expect(invoiceFileName(content('', ''))).toBe('Invoice.pdf')
    expect(invoiceFileName(content('INV-0001', ' '))).toBe('Invoice INV-0001.pdf')
  })
})
