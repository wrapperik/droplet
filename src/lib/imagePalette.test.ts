import { IMAGE_MAX_BYTES, checkImageFile, extractColours } from './imagePalette.ts'

// RGBA pixel data made from a list of [colour, how many pixels, alpha].
type Block = [number[], number, number?]
function pixels(...blocks: Block[]): Uint8ClampedArray {
  const list: number[] = []
  for (const [[r, g, b], count, alpha = 255] of blocks) for (let i = 0; i < count; i += 1) list.push(r, g, b, alpha)
  return Uint8ClampedArray.from(list)
}

describe('checkImageFile', () => {
  const ok = { type: 'image/png', size: 1000, name: 'a.png' }
  it('accepts JPEG, PNG and WebP up to 10 MB', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(checkImageFile({ ...ok, type })).toBeNull()
    expect(checkImageFile({ ...ok, size: IMAGE_MAX_BYTES })).toBeNull()
  })

  it('says what is wrong, and what to do, for another type, an empty file and a file that is too big', () => {
    expect(checkImageFile({ ...ok, type: 'image/gif' })).toMatch(/JPEG, PNG or WebP/)
    expect(checkImageFile({ ...ok, type: 'application/pdf' })).toMatch(/Choose a picture/)
    expect(checkImageFile({ ...ok, size: 0 })).toMatch(/empty/)
    expect(checkImageFile({ ...ok, size: IMAGE_MAX_BYTES + 1 })).toMatch(/over 10 MB/)
  })
})

describe('extractColours', () => {
  const red = [220, 40, 40]
  const blue = [30, 90, 200]
  const yellow = [240, 200, 40]
  const green = [40, 160, 80]
  const cream = [245, 236, 220]

  it('finds the main colours of a picture, the commonest first, as capitalised hex codes', () => {
    const colours = extractColours(pixels([cream, 500], [blue, 300], [red, 150], [yellow, 50]), 4)
    expect(colours).toHaveLength(4)
    for (const hex of colours) expect(hex).toMatch(/^#[0-9A-F]{6}$/)
    // cream is the most common, then blue
    expect(colours[0]).toBe('#F5ECDC')
    expect(colours[1]).toBe('#1E5AC8')
  })

  it('gives the same colours in the same order for the same picture, whatever order the pixels come in', () => {
    const forward = pixels([cream, 400], [blue, 300], [red, 200], [green, 100])
    const backward = pixels([green, 100], [red, 200], [blue, 300], [cream, 400])
    expect(extractColours(forward, 4)).toEqual(extractColours(forward, 4))
    expect(extractColours(backward, 4)).toEqual(extractColours(forward, 4))
  })

  it('takes no more than it is asked for', () => {
    const data = pixels([cream, 400], [blue, 300], [red, 200], [green, 100], [yellow, 50])
    expect(extractColours(data, 2)).toHaveLength(2)
    expect(extractColours(data, 5)).toHaveLength(5)
    expect(extractColours(data, 0)).toHaveLength(1)
  })

  it('ignores pixels that are mostly see-through', () => {
    const colours = extractColours(pixels([[0, 255, 0], 1000, 0], [red, 100], [blue, 100]), 3)
    expect(colours).toHaveLength(2)
    expect(colours).not.toContain('#00FF00')
  })

  it('gives nothing for a picture that is wholly see-through or has no pixels', () => {
    expect(extractColours(pixels([red, 100, 0]), 5)).toEqual([])
    expect(extractColours(new Uint8ClampedArray(0), 5)).toEqual([])
  })

  it('merges colours that look the same, keeping the commoner', () => {
    const nearRed = [226, 44, 44]
    const colours = extractColours(pixels([red, 300], [nearRed, 100], [blue, 200]), 3)
    expect(colours).toHaveLength(2)
    expect(colours.some((hex) => hex === '#DC2828')).toBe(true)
  })

  it('gives one colour for a flat picture', () => {
    expect(extractColours(pixels([blue, 400]), 5)).toEqual(['#1E5AC8'])
  })

  it('copes with a big picture quickly', () => {
    const data = new Uint8ClampedArray(100 * 100 * 4)
    for (let i = 0; i < 100 * 100; i += 1) {
      data[i * 4] = (i * 7) % 256
      data[i * 4 + 1] = (i * 13) % 256
      data[i * 4 + 2] = (i * 29) % 256
      data[i * 4 + 3] = 255
    }
    const colours = extractColours(data, 5)
    expect(colours.length).toBeGreaterThan(1)
    expect(colours.length).toBeLessThanOrEqual(5)
  })
})
