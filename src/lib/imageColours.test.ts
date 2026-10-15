import { afterEach, describe, expect, it, vi } from 'vitest'
import { readImageColours } from './imageColours.ts'

const file = (type = 'image/png', size = 100) => {
  const made = new File(['x'], 'p.png', { type })
  Object.defineProperty(made, 'size', { value: size })
  return made
}

// Pixels of a 2 by 2 picture: two of one colour, one of another, one see-through.
const pixels = Uint8ClampedArray.from([200, 30, 30, 255, 200, 30, 30, 255, 20, 40, 200, 255, 0, 255, 0, 0])

function pretendBrowser({ context = true }: { context?: boolean } = {}) {
  const draw = vi.fn()
  const close = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close })))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() =>
    context ? { drawImage: draw, getImageData: () => ({ data: pixels }) } : null) as unknown as HTMLCanvasElement['getContext'])
  return { draw, close }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('readImageColours', () => {
  it('refuses a file that is not a JPEG, PNG or WebP, or is too big, before reading it', async () => {
    const decode = vi.fn()
    vi.stubGlobal('createImageBitmap', decode)
    expect(await readImageColours(file('image/gif'), 5)).toMatchObject({ ok: false, reason: expect.stringContaining('JPEG, PNG or WebP') })
    expect(await readImageColours(file('image/png', 11 * 1024 * 1024), 5)).toMatchObject({ ok: false, reason: expect.stringContaining('10 MB') })
    expect(decode).not.toHaveBeenCalled()
  })

  it('draws the picture small on a canvas that is never on the page, takes its colours and lets the picture go', async () => {
    const { draw, close } = pretendBrowser()
    const result = await readImageColours(file(), 5)
    expect(result).toEqual({ ok: true, colours: ['#C81E1E', '#1428C8'] })
    // a 4000 by 3000 picture is drawn at 96 by 72
    expect(draw).toHaveBeenCalledWith(expect.anything(), 0, 0, 96, 72)
    expect(close).toHaveBeenCalled()
    expect(document.querySelector('canvas')).toBeNull()
  })

  it('does not send the picture anywhere', async () => {
    pretendBrowser()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await readImageColours(file(), 5)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('says so when the picture cannot be read', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('bad'))))
    expect(await readImageColours(file(), 5)).toMatchObject({ ok: false, reason: expect.stringContaining('could not be read') })
  })

  it('says so when the browser cannot draw it', async () => {
    pretendBrowser({ context: false })
    expect(await readImageColours(file(), 5)).toMatchObject({ ok: false, reason: expect.stringContaining('could not read the picture') })
  })

  it('says so when every pixel is see-through', async () => {
    pretendBrowser()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({ drawImage: () => {}, getImageData: () => ({ data: Uint8ClampedArray.from([1, 2, 3, 0]) }) })) as unknown as HTMLCanvasElement['getContext'])
    expect(await readImageColours(file(), 5)).toMatchObject({ ok: false, reason: expect.stringContaining('no visible colours') })
  })
})
