// Colour maths. Anything with one right answer is computed in code, never by the model.
export type Rgb = { r: number; g: number; b: number } // 0 to 255
export type Hsv = { h: number; s: number; v: number } // h 0 to 360, s and v 0 to 1

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// Accepts "#abc", "abc", "#aabbcc" or "aabbcc". Returns "#AABBCC", or null when invalid.
export function normaliseHex(input: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim())
  if (!match) return null
  const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1]
  return `#${digits.toUpperCase()}`
}

export function hexToRgb(hex: string): Rgb {
  const normalised = normaliseHex(hex)
  if (!normalised) throw new Error(`Invalid hex colour: ${hex}`)
  const value = parseInt(normalised.slice(1), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (channel: number) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase()
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === red) h = ((green - blue) / delta) % 6
    else if (max === green) h = (blue - red) / delta + 2
    else h = (red - green) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

export type Hsl = { h: number; s: number; l: number } // h 0 to 360, s and l 0 to 1

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const l = (max + min) / 2
  const delta = max - min
  if (delta === 0) return { h: 0, s: 0, l }
  const s = delta / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === red) h = ((green - blue) / delta) % 6
  else if (max === green) h = (blue - red) / delta + 2
  else h = (red - green) / delta + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s, l }
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const sector = (((h % 360) + 360) % 360) / 60
  const x = chroma * (1 - Math.abs((sector % 2) - 1))
  const [r1, g1, b1] =
    sector < 1 ? [chroma, x, 0]
    : sector < 2 ? [x, chroma, 0]
    : sector < 3 ? [0, chroma, x]
    : sector < 4 ? [0, x, chroma]
    : sector < 5 ? [x, 0, chroma]
    : [chroma, 0, x]
  const offset = l - chroma / 2
  return { r: (r1 + offset) * 255, g: (g1 + offset) * 255, b: (b1 + offset) * 255 }
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const chroma = v * s
  const sector = (((h % 360) + 360) % 360) / 60
  const x = chroma * (1 - Math.abs((sector % 2) - 1))
  const [r1, g1, b1] =
    sector < 1 ? [chroma, x, 0]
    : sector < 2 ? [x, chroma, 0]
    : sector < 3 ? [0, chroma, x]
    : sector < 4 ? [0, x, chroma]
    : sector < 5 ? [x, 0, chroma]
    : [chroma, 0, x]
  const offset = v - chroma
  return { r: (r1 + offset) * 255, g: (g1 + offset) * 255, b: (b1 + offset) * 255 }
}

// WCAG 2.x relative luminance and contrast ratio.
export function relativeLuminance({ r, g, b }: Rgb): number {
  const linear = (channel: number) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

export type ContrastLevel = 'AAA' | 'AA' | 'fail'

// Normal body text: AA is 4.5:1, AAA is 7:1.
export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  return 'fail'
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const INK: Rgb = { r: 14, g: 26, b: 43 }

// Whichever of white or Ink reads better on the given colour. Used for labels placed on a swatch.
export function readableTextColour(hex: string): string {
  const background = hexToRgb(hex)
  return contrastRatio(background, WHITE) >= contrastRatio(background, INK) ? '#FFFFFF' : '#0E1A2B'
}

// Rotates the hue and keeps saturation and brightness. Used to suggest the next colour in a palette.
export function shiftHue(hex: string, degrees: number): string {
  const { h, s, v } = rgbToHsv(hexToRgb(hex))
  return rgbToHex(hsvToRgb({ h: (h + degrees + 360) % 360, s, v }))
}

// `top` laid over `base` at the given share (0 to 1), as a solid colour. Used for the soft stripes on an invoice, where a transparent fill cannot be printed.
export function mixHex(base: string, top: string, share: number): string {
  const a = hexToRgb(base)
  const b = hexToRgb(top)
  const amount = clamp(share, 0, 1)
  return rgbToHex({ r: a.r + (b.r - a.r) * amount, g: a.g + (b.g - a.g) * amount, b: a.b + (b.b - a.b) * amount })
}
