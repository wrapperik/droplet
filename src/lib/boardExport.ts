import { drawBoard, paintDrawing, type Drawing, type Surface } from './boardDrawing.ts'
import type { BoardItem } from './boardTypes.ts'

// Taking the board out of Droplet as a file: a PNG of the board, or a PDF of it. The pure parts are here; the PDF
// itself is laid out in src/export/boardPdf.tsx, which is loaded only when it is wanted.

export type BoardFormat = 'pdf' | 'png'

export type BoardExportInput = { items: BoardItem[]; projectName: string }

// Why a file cannot be made yet, in words, or null when it can. Both files are the board, so both need something on it.
export function exportBlockedReason(items: BoardItem[]): string | null {
  return items.length > 0 ? null : 'Put something on the board first.'
}

const printable = (text: string) => [...text].map((character) => (character.charCodeAt(0) < 32 ? ' ' : character)).join('')

// What a downloaded file is called: "Kindred Gifting board.pdf", with anything a file name cannot hold taken out.
export function boardFileName(projectName: string, format: BoardFormat): string {
  const clean = printable(projectName).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  return `${clean ? `${clean} ` : ''}board.${format}`
}

// The built-in PDF font draws Latin letters, and the usual punctuation of writing. Anything else (an emoji, a letter from another script) it
// cannot draw, so it is shown as a question mark rather than a blank or a broken box. A no-break space it can draw.
const WIN_ANSI_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
export const pdfSafe = (text: string) =>
  [...text.replace(/[   ]/g, ' ')]
    .map((character) => {
      const code = character.codePointAt(0)!
      return code === 10 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255) || WIN_ANSI_EXTRAS.has(character) ? character : code < 32 ? ' ' : '?'
    })
    .join('')

// The most pixels a side of the PNG may have, and the most in all, so a large board does not make a picture a browser cannot hold.
const MAX_SIDE = 8192
const MAX_PIXELS = 36_000_000
// How sharp the PNG is: twice the board's size, less if that would be too large.
export function pngScale(drawing: Pick<Drawing, 'width' | 'height'>): number {
  const wanted = 2
  const bySide = MAX_SIDE / Math.max(drawing.width, drawing.height)
  const byArea = Math.sqrt(MAX_PIXELS / (drawing.width * drawing.height))
  return Math.max(Math.min(wanted, bySide, byArea), 0.05)
}

// Paints the board on a canvas and gives back the PNG, or null if the browser could not make one.
export async function boardPng(items: BoardItem[], make: (width: number, height: number) => { surface: Surface | null; toBlob: () => Promise<Blob | null> }): Promise<Blob | null> {
  const drawing = drawBoard(items)
  if (!drawing) return null
  const scale = pngScale(drawing)
  const { surface, toBlob } = make(Math.round(drawing.width * scale), Math.round(drawing.height * scale))
  if (!surface) return null
  paintDrawing(surface, drawing, scale)
  return toBlob()
}

// A canvas in the page, for the PNG.
const pageCanvas = (width: number, height: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return { surface: canvas.getContext('2d') as Surface | null, toBlob: () => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png')) }
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// Makes the file and hands it to the browser as a download. Returns whether it worked. Nothing here changes the board or the memory.
export async function exportBoard(format: BoardFormat, input: BoardExportInput): Promise<boolean> {
  if (exportBlockedReason(input.items)) return false
  try {
    const blob =
      format === 'png'
        ? await boardPng(input.items, pageCanvas)
        : await (await import('../export/boardPdf.tsx')).buildBoardPdf(input.items, input.projectName, new Date())
    if (!blob) return false
    saveBlob(blob, boardFileName(input.projectName, format))
    return true
  } catch {
    return false
  }
}
