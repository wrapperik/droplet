import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LogoSave } from './logoSave.ts'
import { alignedPng, contentBounds, pngForPdf, RASTER_MAX_SIDE, rasterSize } from './logoRaster.ts'

const png: LogoSave = { kind: 'png', name: 'a.png', size: 4, dataUrl: 'data:image/png;base64,AAAA', savedAt: '2026-10-15T09:00:00.000Z' }
const svg: LogoSave = { kind: 'svg', name: 'a.svg', size: 4, dataUrl: 'data:image/svg+xml;base64,AAAA', savedAt: '2026-10-15T09:00:00.000Z' }

describe('rasterSize', () => {
  it('scales the longer side to the limit and keeps the shape', () => {
    expect(rasterSize(600, 300)).toEqual({ width: RASTER_MAX_SIDE, height: RASTER_MAX_SIDE / 2 })
    expect(rasterSize(100, 400, 800)).toEqual({ width: 200, height: 800 })
  })

  it('draws an SVG with no size of its own square', () => {
    expect(rasterSize(0, 0)).toEqual({ width: RASTER_MAX_SIDE, height: RASTER_MAX_SIDE })
    expect(rasterSize(Number.NaN, 20, 500)).toEqual({ width: 500, height: 500 })
  })

  it('never makes a side less than a pixel', () => {
    expect(rasterSize(10000, 1, 100)).toEqual({ width: 100, height: 1 })
  })
})

describe('pngForPdf', () => {
  const restore: (() => void)[] = []
  afterEach(() => {
    restore.splice(0).forEach((undo) => undo())
    vi.unstubAllGlobals()
  })

  // jsdom draws no images and has no canvas, so both are stood in for.
  const standIn = (options: { loads: boolean; natural?: [number, number]; context?: boolean; url?: string }) => {
    class FakeImage {
      naturalWidth = options.natural?.[0] ?? 0
      naturalHeight = options.natural?.[1] ?? 0
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => (options.loads ? this.onload?.() : this.onerror?.()))
      }
    }
    vi.stubGlobal('Image', FakeImage)
    const drawn: number[][] = []
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => (options.context === false ? null : { drawImage: (...args: number[]) => drawn.push(args.slice(1)) })) as never)
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(options.url ?? 'data:image/png;base64,RASTER')
    restore.push(() => getContext.mockRestore(), () => toDataURL.mockRestore())
    return drawn
  }

  it('uses a PNG as it is, and has nothing for no logo', async () => {
    expect(await pngForPdf(png)).toBe(png.dataUrl)
    expect(await pngForPdf(null)).toBeNull()
    expect(await pngForPdf(undefined)).toBeNull()
  })

  it('draws an SVG onto a canvas at its own shape and returns a PNG', async () => {
    const drawn = standIn({ loads: true, natural: [300, 150] })
    expect(await pngForPdf(svg)).toBe('data:image/png;base64,RASTER')
    expect(drawn).toEqual([[0, 0, RASTER_MAX_SIDE, RASTER_MAX_SIDE / 2]])
  })

  it('gives nothing, so the PDF keeps the business name, when the SVG cannot be drawn, there is no canvas or the result is not a PNG', async () => {
    standIn({ loads: false })
    expect(await pngForPdf(svg)).toBeNull()
    restore.splice(0).forEach((undo) => undo())
    standIn({ loads: true, natural: [10, 10], context: false })
    expect(await pngForPdf(svg)).toBeNull()
    restore.splice(0).forEach((undo) => undo())
    standIn({ loads: true, natural: [10, 10], url: 'data:,' })
    expect(await pngForPdf(svg)).toBeNull()
  })
})

describe('contentBounds', () => {
  // A width by height image of one colour, with the given pixels set.
  const image = (width: number, height: number, fill: number[], marks: [number, number, number[]][] = []) => {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < width * height; i++) data.set(fill, i * 4)
    for (const [x, y, colour] of marks) data.set(colour, (y * width + x) * 4)
    return { data, width, height }
  }

  it('finds the box round what is drawn on a transparent image', () => {
    const pixels = image(10, 8, [0, 0, 0, 0], [[2, 3, [0, 0, 0, 255]], [6, 5, [0, 0, 0, 255]]])
    expect(contentBounds(pixels)).toEqual({ left: 2, top: 3, right: 7, bottom: 6 })
  })

  it('treats the colour of the corner as empty when the image has a solid background', () => {
    const pixels = image(6, 6, [255, 255, 255, 255], [[1, 1, [10, 20, 30, 255]], [3, 4, [10, 20, 30, 255]]])
    expect(contentBounds(pixels)).toEqual({ left: 1, top: 1, right: 4, bottom: 5 })
  })

  it('gives nothing for an image with nothing drawn, or no size', () => {
    expect(contentBounds(image(4, 4, [0, 0, 0, 0]))).toBeNull()
    expect(contentBounds({ data: [], width: 0, height: 0 })).toBeNull()
  })

  it('gives nothing for one flat colour, which is a background and not a mark', () => {
    expect(contentBounds(image(3, 3, [0, 0, 0, 255]))).toBeNull()
  })
})

describe('alignedPng', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('has nothing for no logo, and the logo as it is where there is no canvas to trim it on', async () => {
    class FailingImage {
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', FailingImage)
    expect(await alignedPng(null)).toBeNull()
    expect(await alignedPng(png)).toBe(png.dataUrl)
  })
})
