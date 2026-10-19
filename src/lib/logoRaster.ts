import type { LogoSave } from './logoSave.ts'

// The PDF library draws PNG and JPEG, not SVG. A logo brought back as an SVG is therefore drawn onto a canvas in the browser and turned into a PNG
// before the PDF is made. The page on screen draws the SVG itself, which stays sharp at any size. Nothing here leaves the browser.

// The longest side of the PNG made from an SVG, in pixels: sharp in print at the size a logo sits on an invoice, and small enough to keep the file light.
export const RASTER_MAX_SIDE = 1200

// The size to draw an image of the given natural size at, so its longer side is `max` and its shape is kept. An SVG with no size of its own has
// none to give, so it is drawn square at `max`.
export function rasterSize(width: number, height: number, max: number = RASTER_MAX_SIDE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: max, height: max }
  const scale = max / Math.max(width, height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

// The logo as a PNG data address for the PDF, or null if it could not be made (the PDF then goes without it and keeps the business name). A PNG is
// used as it is.
export async function pngForPdf(logo: LogoSave | null | undefined): Promise<string | null> {
  if (!logo) return null
  if (logo.kind === 'png') return logo.dataUrl
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('The SVG could not be drawn.'))
      element.src = logo.dataUrl
    })
    const { width, height } = rasterSize(image.naturalWidth, image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0, width, height)
    const url = canvas.toDataURL('image/png')
    return url.startsWith('data:image/png') ? url : null
  } catch {
    return null
  }
}

// ---- Aligning a logo ----
// A logo often comes with empty space round it, more on one side than the other, so it sits off-centre wherever it is placed. Aligning trims that space away,
// so the mark itself is what is centred and sized. Empty is transparent, or the colour of the corner when the image has a solid background.

type Pixels = { data: ArrayLike<number>; width: number; height: number }
export type Bounds = { left: number; top: number; right: number; bottom: number }

const ALPHA_EMPTY = 8
const COLOUR_NEAR = 14

// The box that holds everything that is not empty, or null when nothing is drawn.
export function contentBounds({ data, width, height }: Pixels): Bounds | null {
  if (width < 1 || height < 1) return null
  const corner = [data[0], data[1], data[2], data[3]]
  const solid = corner[3] >= 250
  const empty = (index: number) => {
    if (data[index + 3] < ALPHA_EMPTY) return true
    return solid && Math.abs(data[index] - corner[0]) < COLOUR_NEAR && Math.abs(data[index + 1] - corner[1]) < COLOUR_NEAR && Math.abs(data[index + 2] - corner[2]) < COLOUR_NEAR
  }
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (empty((y * width + x) * 4)) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  return right < 0 ? null : { left, top, right: right + 1, bottom: bottom + 1 }
}

// The logo as a PNG data address with the empty space round it trimmed off, for the page and the PDF. Where that cannot be done (no canvas, an image that
// cannot be read, nothing to trim) it is the logo as `pngForPdf` gives it, and null only where that is null.
export async function alignedPng(logo: LogoSave | null | undefined): Promise<string | null> {
  if (!logo) return null
  const plain = await pngForPdf(logo)
  if (!plain) return null
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('The logo could not be read.'))
      element.src = plain
    })
    const { width, height } = rasterSize(image.naturalWidth, image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return plain
    context.drawImage(image, 0, 0, width, height)
    const bounds = contentBounds(context.getImageData(0, 0, width, height))
    if (!bounds || (bounds.left === 0 && bounds.top === 0 && bounds.right === width && bounds.bottom === height)) return plain
    const cropped = document.createElement('canvas')
    cropped.width = bounds.right - bounds.left
    cropped.height = bounds.bottom - bounds.top
    const target = cropped.getContext('2d')
    if (!target) return plain
    target.drawImage(canvas, bounds.left, bounds.top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height)
    const url = cropped.toDataURL('image/png')
    return url.startsWith('data:image/png') ? url : plain
  } catch {
    return plain
  }
}
