// The looks an invoice can have. A template changes how the page is laid out and drawn, never what it says: the words and the sums come from
// `invoiceView`, and every template is drawn in the founder's own palette. The page on screen (`InvoiceDocument.css`) and the PDF
// (`src/export/invoicePdf.tsx`) each draw every template, keyed by the ids here.

export const TEMPLATE_IDS = ['band', 'minimal', 'classic', 'striped', 'rounded', 'boxed'] as const
export type InvoiceTemplateId = (typeof TEMPLATE_IDS)[number]

export const DEFAULT_TEMPLATE: InvoiceTemplateId = 'band'

export type InvoiceTemplate = {
  id: InvoiceTemplateId
  name: string
  // One plain line on what makes it different.
  blurb: string
  // The payment details and the note sit in a coloured band at the foot of the page, and not under the totals.
  footerBand: boolean
}

export const TEMPLATES: InvoiceTemplate[] = [
  { id: 'band', name: 'Band', blurb: 'A strip of your colour carries the title, with the total in a bar.', footerBand: false },
  { id: 'minimal', name: 'Minimal', blurb: 'A large title and fine rules, with no fills. The lightest on ink.', footerBand: false },
  { id: 'classic', name: 'Classic', blurb: 'A centred heading between two heavy rules, with rules and no fills.', footerBand: false },
  { id: 'striped', name: 'Striped', blurb: 'A stripe down the edge, striped rows, and payment details in a band at the foot.', footerBand: true },
  { id: 'rounded', name: 'Rounded', blurb: 'A block with a soft corner holds the title. The table and total are pills.', footerBand: false },
  { id: 'boxed', name: 'Boxed', blurb: 'A heavy title, shaded headings and a ruled grid for the items.', footerBand: false },
]

export const isTemplateId = (value: unknown): value is InvoiceTemplateId => TEMPLATE_IDS.includes(value as InvoiceTemplateId)

// An invoice made before templates existed has none, and keeps the look it had.
export const templateOf = (details: { template?: InvoiceTemplateId }): InvoiceTemplate => TEMPLATES.find((template) => template.id === details.template) ?? TEMPLATES[0]
