import { rgbToHex } from './colour.ts'

// Taking a palette from a picture, in the browser. Nothing here touches the picture's file or the network: it is given the pixels (already drawn small on a
// canvas by `imageColours.ts`) and works out the colours in code. The same pixels always give the same colours, in the same order.

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const IMAGE_RULE = 'File must be JPEG, PNG or WebP and up to 10 MB'

// Pixels that are mostly see-through carry no colour of their own, so they are left out.
const MIN_ALPHA = 125
// Colours closer than this (straight-line distance in red, green and blue, out of about 441) look the same on a swatch, so only the commoner is kept.
const NEAR = 40

// Why a file cannot be used, in words that say what to do, or null if it can.
export function checkImageFile(file: { type: string; size: number; name?: string }): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return 'That file is not a JPEG, PNG or WebP picture. Choose a picture in one of those formats.'
  if (file.size <= 0) return 'That file is empty. Choose another picture.'
  if (file.size > IMAGE_MAX_BYTES) return 'That picture is over 10 MB. Choose a smaller one, or make it smaller first.'
  return null
}

type Bucket = { r: number; g: number; b: number; count: number }
type Box = { buckets: Bucket[] }

// Pixels are counted in buckets of 8 levels a channel, so a photograph with a million shades is a few thousand things to cut up.
function bucketsOf(data: ArrayLike<number>): Bucket[] {
  const sums = new Map<number, Bucket>()
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < MIN_ALPHA) continue
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)
    const bucket = sums.get(key)
    if (bucket) {
      bucket.r += data[i]
      bucket.g += data[i + 1]
      bucket.b += data[i + 2]
      bucket.count += 1
    } else sums.set(key, { r: data[i], g: data[i + 1], b: data[i + 2], count: 1 })
  }
  // Sorted by key so the result does not depend on the order the pixels were met in.
  return [...sums.entries()].sort((a, b) => a[0] - b[0]).map((entry) => entry[1])
}

const channelOf = (bucket: Bucket, channel: 0 | 1 | 2) => (channel === 0 ? bucket.r : channel === 1 ? bucket.g : bucket.b) / bucket.count

function rangeOf(box: Box): { channel: 0 | 1 | 2; size: number } {
  let best: { channel: 0 | 1 | 2; size: number } = { channel: 0, size: -1 }
  for (const channel of [0, 1, 2] as const) {
    let low = 255
    let high = 0
    for (const bucket of box.buckets) {
      const value = channelOf(bucket, channel)
      if (value < low) low = value
      if (value > high) high = value
    }
    if (high - low > best.size) best = { channel, size: high - low }
  }
  return best
}

const populationOf = (box: Box) => box.buckets.reduce((sum, bucket) => sum + bucket.count, 0)

// Median cut: keep splitting the box that is biggest in colour range and in pixels, at the middle pixel along its widest channel.
function cut(buckets: Bucket[], parts: number): Box[] {
  const boxes: Box[] = [{ buckets }]
  while (boxes.length < parts) {
    let pick = -1
    let pickScore = 0
    boxes.forEach((box, index) => {
      if (box.buckets.length < 2) return
      const score = rangeOf(box).size * populationOf(box)
      if (score > pickScore) {
        pick = index
        pickScore = score
      }
    })
    if (pick < 0) break
    const box = boxes[pick]
    const { channel } = rangeOf(box)
    const sorted = [...box.buckets].sort((a, b) => channelOf(a, channel) - channelOf(b, channel) || a.count - b.count)
    const half = populationOf(box) / 2
    let seen = 0
    let at = 1
    for (let i = 0; i < sorted.length - 1; i += 1) {
      seen += sorted[i].count
      at = i + 1
      if (seen >= half) break
    }
    boxes.splice(pick, 1, { buckets: sorted.slice(0, at) }, { buckets: sorted.slice(at) })
  }
  return boxes
}

type Swatch = { r: number; g: number; b: number; count: number; hex: string }

function averageOf(box: Box): Swatch {
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (const bucket of box.buckets) {
    r += bucket.r
    g += bucket.g
    b += bucket.b
    count += bucket.count
  }
  const mean = { r: r / count, g: g / count, b: b / count }
  return { ...mean, count, hex: rgbToHex(mean) }
}

const apart = (a: Swatch, b: Swatch) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)

// The commoner of any two near-identical swatches is kept. Most-populous first, then by hex, so ties never depend on order.
function distinct(swatches: Swatch[]): Swatch[] {
  const ordered = [...swatches].sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))
  const kept: Swatch[] = []
  for (const swatch of ordered) if (kept.every((other) => apart(swatch, other) >= NEAR)) kept.push(swatch)
  return kept
}

// Up to `count` colours from RGBA pixel data (four numbers a pixel, as a canvas gives them): the commonest colours of the picture, as capitalised hex codes, the most
// common first, no two that look alike. Fewer than `count` come back when the picture has fewer distinct colours (a flat picture has one), and none when every
// pixel is see-through.
export function extractColours(data: ArrayLike<number>, count: number): string[] {
  const wanted = Math.max(1, Math.floor(count))
  const buckets = bucketsOf(data)
  if (buckets.length === 0) return []
  let found: Swatch[] = []
  // If merging look-alikes leaves too few, cut into more parts and try again, up to three times as many.
  for (let parts = wanted; parts <= wanted * 3; parts += 1) {
    found = distinct(cut(buckets, parts).map(averageOf))
    if (found.length >= wanted) break
  }
  return found.slice(0, wanted).map((swatch) => swatch.hex)
}
