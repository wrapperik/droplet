import { describe, expect, it } from 'vitest'
import { newContent } from './invoice.ts'
import { invoiceContentSchema } from './invoiceSave.ts'
import { DEFAULT_TEMPLATE, TEMPLATES, TEMPLATE_IDS, isTemplateId, templateOf } from './invoiceTemplates.ts'

describe('invoice templates', () => {
  it('lists each id once, with a name and a blurb', () => {
    expect(TEMPLATES.map((template) => template.id)).toEqual([...TEMPLATE_IDS])
    for (const template of TEMPLATES) {
      expect(template.name).not.toBe('')
      expect(template.blurb).not.toBe('')
    }
  })

  it('gives an invoice from before templates the first look', () => {
    expect(templateOf(newContent('2026-10-04').details).id).toBe(DEFAULT_TEMPLATE)
    expect(templateOf({ template: 'classic' }).id).toBe('classic')
  })

  it('knows a template id from anything else', () => {
    expect(isTemplateId('boxed')).toBe(true)
    expect(isTemplateId('fancy')).toBe(false)
  })

  it('is kept when an invoice is saved and read back, and an unknown one is refused', () => {
    const content = newContent('2026-10-04')
    content.details = { ...content.details, template: 'rounded' }
    expect(invoiceContentSchema.parse(content).details.template).toBe('rounded')
    expect(invoiceContentSchema.safeParse({ ...content, details: { ...content.details, template: 'fancy' } }).success).toBe(false)
    expect(invoiceContentSchema.safeParse(newContent('2026-10-04')).success).toBe(true)
  })
})
