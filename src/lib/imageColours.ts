import { IMAGE_RULE, checkImageFile, extractColours } from './imagePalette.ts'

// Reads a picture the founder chose and takes its colours, entirely in this browser: the file is drawn small on a canvas that is never put on the page, the
// pixels are read, and the file is let go. It is never uploaded, never stored and never sent to the composer.

export type ImageColours = { ok: true; colours: string[] } | { ok: false; reason: string }

// The longest side the picture is drawn at. Colours do not need more, and a phone photograph has twelve million pixels.
const SAMPLE_SIDE = 96

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close?.() }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('decode'))
      image.src = url
    })
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function readImageColours(file: File, count: number): Promise<ImageColours> {
  const refused = checkImageFile(file)
  if (refused) return { ok: false, reason: refused }
  try {
    const decoded = await decode(file)
    try {
      const scale = Math.min(1, SAMPLE_SIDE / Math.max(decoded.width, decoded.height, 1))
      const width = Math.max(1, Math.round(decoded.width * scale))
      const height = Math.max(1, Math.round(decoded.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return { ok: false, reason: 'This browser could not read the picture. Try another browser, or pick the colours by hand.' }
      context.drawImage(decoded.source, 0, 0, width, height)
      const colours = extractColours(context.getImageData(0, 0, width, height).data, count)
      if (colours.length === 0) return { ok: false, reason: 'That picture has no visible colours to take. Try another one.' }
      return { ok: true, colours }
    } finally {
      decoded.release()
    }
  } catch {
    return { ok: false, reason: `That picture could not be read. It may be damaged. ${IMAGE_RULE}.` }
  }
}
