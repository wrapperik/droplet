import { describe, expect, it, vi } from 'vitest'
import { boardFileName, boardPng, exportBlockedReason, exportBoard, pdfSafe, pngScale, summarySheet } from './boardExport.ts'
import type { BoardItem, BoardSummary, NoteItem } from './boardTypes.ts'
import { emptyMemory, withIdea } from './projectMemory.ts'

const note = (id: string): NoteItem => ({ id, kind: 'note', x: 100, y: 100, w: 200, h: 180, text: id, colour: 'yellow', author: 'you' })
const summary = (extra: Partial<BoardSummary> = {}): BoardSummary => ({ decided: ['The name is Kindred'], open: ['The first offer'], next: [], by: 'droplet', edited: false, writtenAt: '2026-10-05T10:00:00', ...extra })

describe('the summary page', () => {
  it('has no page without a summary or anything remembered', () => {
    expect(summarySheet(null, emptyMemory())).toBeNull()
    expect(summarySheet({ ...summary(), decided: [], open: [] }, emptyMemory())).toBeNull()
  })

  it('lists the sections that have lines, in the order of the summary, and leaves the empty ones out', () => {
    const sheet = summarySheet(summary(), emptyMemory())!
    expect(sheet.sections).toEqual([{ label: 'Decided', lines: ['The name is Kindred'] }, { label: 'Still open', lines: ['The first offer'] }])
  })

  it('says who wrote it and when, and whether the founder changed it', () => {
    expect(summarySheet(summary(), emptyMemory())!.by).toBe('Written by Droplet, 5 October 2026')
    expect(summarySheet(summary({ edited: true }), emptyMemory())!.by).toBe('Written by Droplet, changed by the founder, 5 October 2026')
    expect(summarySheet(summary({ by: 'you' }), emptyMemory())!.by).toBe('Written by the founder, 5 October 2026')
  })

  it('carries the name and offer the project remembers, even with no summary', () => {
    const memory = withIdea(withIdea(emptyMemory(), 'name', 'Kindred Gifting', '2026-10-05T09:00:00'), 'offer', 'Gift boxes', '2026-10-05T09:01:00')
    expect(summarySheet(null, memory)).toEqual({ by: '', sections: [], remembered: [{ label: 'Business name', value: 'Kindred Gifting' }, { label: 'Offer', value: 'Gift boxes' }] })
  })
})

describe('when a file cannot be made yet', () => {
  const none = { items: [] as BoardItem[], summary: null, memory: emptyMemory() }

  it('blocks a PNG of an empty board, and a PDF of nothing at all, and says what to do', () => {
    expect(exportBlockedReason('png', none)).toBe('Put something on the board first.')
    expect(exportBlockedReason('pdf', none)).toBe('Put something on the board or write a summary first.')
  })

  it('lets the PDF carry a summary alone, but not the PNG', () => {
    expect(exportBlockedReason('pdf', { ...none, summary: summary() })).toBeNull()
    expect(exportBlockedReason('png', { ...none, summary: summary() })).not.toBeNull()
  })

  it('lets both go once there is something on the board', () => {
    expect(exportBlockedReason('png', { ...none, items: [note('a')] })).toBeNull()
    expect(exportBlockedReason('pdf', { ...none, items: [note('a')] })).toBeNull()
  })

  it('makes nothing when blocked, and says it did not work', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
    expect(await exportBoard('png', { ...none, projectName: 'Kindred' })).toBe(false)
    expect(click).not.toHaveBeenCalled()
    click.mockRestore()
  })
})

describe('the file name', () => {
  it('is the project and the word board, with what a file name cannot hold taken out', () => {
    expect(boardFileName('Kindred Gifting', 'pdf')).toBe('Kindred Gifting board.pdf')
    expect(boardFileName('A/B: "C"', 'png')).toBe('A B C board.png')
    expect(boardFileName('   ', 'png')).toBe('board.png')
  })
})

describe('words in a PDF', () => {
  it('keeps letters, accents and the usual punctuation, and shows what the font cannot draw as a question mark', () => {
    expect(pdfSafe('Café “quoted” – ok… R 1 234')).toBe('Café “quoted” – ok… R 1 234')
    expect(pdfSafe('Gifts 🎁 for you')).toBe('Gifts ? for you')
    expect(pdfSafe('Ж')).toBe('?')
  })

  it('keeps a new line, and turns other control characters into spaces', () => {
    expect(pdfSafe('one\ntwo\tthree')).toBe('one\ntwo three')
  })
})

describe('the PNG', () => {
  it('is twice the size of the board, and smaller when that would be too large for a browser', () => {
    expect(pngScale({ width: 600, height: 400 })).toBe(2)
    const big = pngScale({ width: 4800, height: 3200 })
    expect(big).toBeLessThan(2)
    expect(4800 * big).toBeLessThanOrEqual(8192)
    expect(4800 * big * 3200 * big).toBeLessThanOrEqual(36_000_000)
  })

  it('is made on a canvas the size of the picture at that scale, and painted before it is read', async () => {
    const calls: string[] = []
    const surface = new Proxy({ measureText: (text: string) => ({ width: text.length * 8 }) }, { get: (target, key) => (key in target ? (target as never)[key] : (...args: unknown[]) => calls.push(String(key) + args.length)), set: () => true }) as never
    let size: [number, number] = [0, 0]
    const png = new Blob(['x'], { type: 'image/png' })
    const result = await boardPng([note('a')], (width, height) => {
      size = [width, height]
      return { surface, toBlob: async () => (calls.length > 0 ? png : null) }
    })
    expect(size).toEqual([(200 + 96) * 2, (180 + 96) * 2])
    expect(result).toBe(png)
  })

  it('gives nothing for an empty board, or when the browser has no canvas to paint on', async () => {
    expect(await boardPng([], () => ({ surface: null, toBlob: async () => null }))).toBeNull()
    expect(await boardPng([note('a')], () => ({ surface: null, toBlob: async () => new Blob() }))).toBeNull()
  })
})
