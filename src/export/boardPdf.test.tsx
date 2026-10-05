// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { BoardItem } from '../lib/boardTypes.ts'
import { buildBoardPdf, fitScale } from './boardPdf.tsx'

const board: BoardItem[] = [
  { id: 'f', kind: 'frame', x: 0, y: 40, w: 900, h: 500, title: 'The idea', colour: 'sky' },
  { id: 'a', kind: 'note', x: 40, y: 80, w: 200, h: 180, text: 'Gift boxes from local makers', colour: 'yellow', author: 'you' },
  { id: 'b', kind: 'note', x: 300, y: 80, w: 200, h: 180, text: 'Corporate clients 🎁 in Pretoria', colour: 'pink', author: 'ai' },
  { id: 's1', kind: 'shape', x: 560, y: 80, w: 200, h: 140, shape: 'diamond', text: 'Pricing?', colour: 'peach' },
  { id: 's2', kind: 'shape', x: 560, y: 300, w: 200, h: 140, shape: 'ellipse', text: 'Makers', colour: 'mint' },
  { id: 't', kind: 'text', x: 40, y: 340, w: 300, h: 60, text: 'Next steps', size: 'title' },
  { id: 'c', kind: 'connector', from: { item: 'a' }, to: { item: 'b' }, style: 'elbow', head: 'both', text: 'leads to' },
]

const text = async (blob: Blob) => new TextDecoder('latin1').decode(await blob.arrayBuffer())
const pages = async (blob: Blob) => (await text(blob)).match(/\/Type \/Page\b/g)?.length ?? 0

describe('fitScale', () => {
  it('shrinks a board to the page and never makes it larger', () => {
    expect(fitScale({ width: 400, height: 300 })).toBe(1)
    expect(fitScale({ width: 4000, height: 300 })).toBeCloseTo(770 / 4000)
    expect(fitScale({ width: 400, height: 3000 })).toBeCloseTo(483 / 3000)
  })
})

describe('buildBoardPdf', () => {
  it('makes a real PDF of a board of every kind of thing, on one page', async () => {
    const blob = await buildBoardPdf(board, 'Kindred Gifting', new Date('2026-10-05T10:00:00'))
    expect(blob.type).toBe('application/pdf')
    expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5))).toBe('%PDF-')
    expect(await pages(blob)).toBe(1)
  }, 30_000)

  it('has nothing to print for an empty board, and says so instead of making an empty file', async () => {
    await expect(buildBoardPdf([], 'Kindred', new Date())).rejects.toThrow('The board is empty.')
  })

  it('copes with a board with more on it than a page, drawn small, and with words the font cannot draw', async () => {
    const many: BoardItem[] = Array.from({ length: 60 }, (_, index) => ({ id: `n${index}`, kind: 'note', x: (index % 10) * 440, y: Math.floor(index / 10) * 400, w: 400, h: 360, text: `Note ${index} Ж 🎁`, colour: 'mint', author: 'you' }))
    const blob = await buildBoardPdf(many, 'Big', new Date())
    expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5))).toBe('%PDF-')
    expect(await pages(blob)).toBe(1)
  }, 30_000)
})
