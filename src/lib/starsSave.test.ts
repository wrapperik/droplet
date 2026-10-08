import { describe, expect, it } from 'vitest'
import { boardSaveSchema } from './boardSave.ts'
import { invoiceContentSchema } from './invoiceSave.ts'
import { newContent } from './invoice.ts'
import { paletteSaveSchema } from './paletteSave.ts'

describe('stars in what is saved', () => {
  it('are kept on a board item, and a board saved before them still reads', () => {
    const note = { id: 'a', kind: 'note', x: 0, y: 0, w: 200, h: 180, text: 'x', colour: 'yellow', author: 'you' }
    const base = { items: [], layout: [] }
    const withStar = boardSaveSchema.safeParse({ ...base, items: [{ ...note, starred: true }], savedAt: '2026-10-08T10:00:00.000Z' })
    expect(withStar.success).toBe(true)
    expect(withStar.success && withStar.data.items[0]).toMatchObject({ starred: true })
    expect(boardSaveSchema.safeParse({ ...base, items: [note], savedAt: '2026-10-08T10:00:00.000Z' }).success).toBe(true)
    expect(boardSaveSchema.safeParse({ ...base, items: [{ ...note, starred: 'yes' }], savedAt: '2026-10-08T10:00:00.000Z' }).success).toBe(false)
  })

  it('are kept on a colour, and a palette saved before them still reads', () => {
    const palette = (starred?: unknown) => ({ blocks: [{ id: 1, hex: '#1F8FE0', ...(starred === undefined ? {} : { starred }) }, { id: 2, hex: '#0B4F8A' }], layout: [], savedAt: '2026-10-08T10:00:00.000Z' })
    const read = paletteSaveSchema.safeParse(palette(true))
    expect(read.success && read.data.blocks[0].starred).toBe(true)
    expect(paletteSaveSchema.safeParse(palette()).success).toBe(true)
    expect(paletteSaveSchema.safeParse(palette('yes')).success).toBe(false)
  })

  it('are kept on an invoice line, and an invoice saved before them still reads', () => {
    const content = newContent('2026-10-08')
    const read = invoiceContentSchema.safeParse({ ...content, lines: [{ ...content.lines[0], starred: true }] })
    expect(read.success && read.data.lines[0].starred).toBe(true)
    expect(invoiceContentSchema.safeParse(content).success).toBe(true)
  })
})
