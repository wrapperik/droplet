// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { starterBlocks } from '../compose/fallback.ts'
import { TEMPLATES } from '../lib/invoiceTemplates.ts'
import { newContent, type InvoiceContent } from '../lib/invoice.ts'
import { resolveRoles } from '../lib/palette.ts'
import { fontPairById } from '../lib/brandType.ts'
import { buildInvoicePdf, facesFor } from './invoicePdf.tsx'

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

  // A 1 by 1 PNG, enough for the library to draw.
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const images = async (blob: Blob) => (new TextDecoder('latin1').decode(await blob.arrayBuffer()).match(/\/Subtype \/Image\b/g) ?? []).length

  it('draws the logo in the band when it is given one', async () => {
    expect(await images(await buildInvoicePdf(complete(), roles, PNG))).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it('draws no image, and still names the business, when there is no logo', async () => {
    expect(await images(await buildInvoicePdf(complete(), roles))).toBe(0)
    expect(await images(await buildInvoicePdf(complete(), roles, null))).toBe(0)
  }, 30_000)

  it('makes a PDF from a barely begun invoice with a logo, without failing', async () => {
    const blob = await buildInvoicePdf(newContent('2026-10-04'), roles, PNG)
    expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5))).toBe('%PDF-')
  }, 30_000)

  it.each(TEMPLATES.map((template) => template.id))('makes a PDF in the %s template, with a logo and without, and a long one', async (id) => {
    const content = complete()
    content.details = { ...content.details, template: id }
    for (const logo of [null, PNG]) {
      const blob = await buildInvoicePdf(content, roles, logo)
      expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5))).toBe('%PDF-')
    }
    content.lines = Array.from({ length: 40 }, (_, index) => ({ id: index + 1, description: `Item number ${index + 1}`, quantity: 1, unitCents: 10000 }))
    const long = new TextDecoder('latin1').decode(await (await buildInvoicePdf(content, roles)).arrayBuffer())
    expect(long.match(/\/Type \/Page\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  }, 60_000)

  it('draws in Helvetica without a brand pair, and in the pair\'s families with one', () => {
    expect(facesFor().body.regular.fontFamily).toBe('Helvetica')
    expect(facesFor().heading.bold.fontFamily).toBe('Helvetica-Bold')
    const faces = facesFor(fontPairById('editorial'))
    expect(faces.heading.bold).toEqual({ fontFamily: 'Playfair Display', fontWeight: 700 })
    expect(faces.body.regular).toEqual({ fontFamily: 'Inter', fontWeight: 400 })
  })

  it('has a file to embed for every typeface the brand guide offers', async () => {
    const { FONT_PAIRS } = await import('../lib/brandType.ts')
    for (const pair of FONT_PAIRS) {
      expect(facesFor(pair).heading.regular.fontFamily).toBe(pair.heading)
      expect(facesFor(pair).body.regular.fontFamily).toBe(pair.body)
    }
  })
})
