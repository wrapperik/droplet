import { describe, expect, it, vi } from 'vitest'
import { boardFileName, boardPng, exportBlockedReason, exportBoard, pdfSafe, pngScale } from './boardExport.ts'
import type { BoardItem, NoteItem } from './boardTypes.ts'

const note = (id: string): NoteItem => ({ id, kind: 'note', x: 100, y: 100, w: 200, h: 180, text: id, colour: 'yellow', author: 'you' })

describe('when a file cannot be made yet', () => {
  it('blocks both files for an empty board, and says what to do', () => {
    expect(exportBlockedReason([])).toBe('Put something on the board first.')
  })

  it('lets both go once there is something on the board', () => {
    expect(exportBlockedReason([note('a')])).toBeNull()
  })

  it('makes nothing when blocked, and says it did not work', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
    expect(await exportBoard('png', { items: [] as BoardItem[], projectName: 'Kindred' })).toBe(false)
    expect(await exportBoard('pdf', { items: [] as BoardItem[], projectName: 'Kindred' })).toBe(false)
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
