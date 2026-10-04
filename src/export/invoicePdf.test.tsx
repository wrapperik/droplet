// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { starterBlocks } from '../compose/fallback.ts'
import { newContent, type InvoiceContent } from '../lib/invoice.ts'
import { resolveRoles } from '../lib/palette.ts'
import { buildInvoicePdf } from './invoicePdf.tsx'

const roles = resolveRoles(starterBlocks())

const complete = (): InvoiceContent => {
  const content = newContent('2026-10-04', 'INV-0007')
  content.business = { ...content.business, name: 'Kindred Gifting', address: '12 Jacaranda Street\nPretoria East', vatNumber: '4123456789', accountNumber: '62000000000', bankName: 'FNB' }
  content.client = { ...content.client, name: 'Pretoria Print Works', reference: 'PO 88' }
  content.lines = [
    { id: 1, description: 'Gift box, small', quantity: 12, unitCents: 45000 },
    { id: 2, description: 'Delivery', quantity: 1, unitCents: 25000 },
  ]
  content.vatRegistered = true
  content.details = { ...content.details, notes: 'Thank you.' }
  return content
}

describe('buildInvoicePdf', () => {
  it('makes a real PDF from a complete invoice', async () => {
    const blob = await buildInvoicePdf(complete(), roles)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(blob.type).toBe('application/pdf')
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(1500)
  }, 30_000)

  it('makes one from an invoice that is hardly begun, with its placeholders, without failing', async () => {
    const blob = await buildInvoicePdf(newContent('2026-10-04'), roles)
    expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5))).toBe('%PDF-')
  }, 30_000)

  it('makes one from a long invoice, which runs onto a second page', async () => {
    const content = complete()
    content.lines = Array.from({ length: 60 }, (_, index) => ({ id: index + 1, description: `Item number ${index + 1}`, quantity: 1, unitCents: 10000 }))
    const blob = await buildInvoicePdf(content, roles)
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer())
    expect(text.match(/\/Type \/Page\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  }, 30_000)
})
