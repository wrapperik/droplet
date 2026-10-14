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
