import { contrastRatio, hexToRgb } from '../lib/colour.ts'

// Rules about a palette, checked in code and never taken on the model's word. Each message is written to be sent
// back to the model if it has to try again.

export const AA = 4.5

type Colour = { hex: string; role?: string }

const ratio = (a: string, b: string) => contrastRatio(hexToRgb(a), hexToRgb(b))

// The best contrast any two of these colours reach, so "can body text be read anywhere" has an answer.
export function bestContrast(colours: Colour[]): number {
  let best = 0
  for (let i = 0; i < colours.length; i += 1) {
    for (let j = i + 1; j < colours.length; j += 1) best = Math.max(best, ratio(colours[i].hex, colours[j].hex))
  }
  return best
}

export function paletteErrors(colours: Colour[]): string[] {
  const errors: string[] = []

  const seen = new Set<string>()
  for (const colour of colours) {
    const key = colour.hex.toUpperCase()
    if (seen.has(key)) errors.push(`The colour ${key} appears more than once. Every colour must be different.`)
    seen.add(key)
  }

  const used = new Map<string, number>()
  for (const colour of colours) if (colour.role) used.set(colour.role, (used.get(colour.role) ?? 0) + 1)
  for (const [role, count] of used) if (count > 1) errors.push(`The role "${role}" is given to ${count} colours. Give each role to at most one colour.`)

  const best = bestContrast(colours)
  if (best < AA) {
    errors.push(
      `No two colours reach a contrast ratio of ${AA}:1 (the best pair reaches ${best.toFixed(1)}:1), so body text could not be read anywhere. Keep one light colour and one dark colour.`,
    )
  }

  const background = colours.find((c) => c.role === 'background')
  const text = colours.find((c) => c.role === 'text')
  if (background && text && ratio(background.hex, text.hex) < AA) {
    errors.push(
      `The text colour ${text.hex} on the background colour ${background.hex} reaches only ${ratio(background.hex, text.hex).toFixed(1)}:1. It must reach ${AA}:1. Choose a different pair for those roles.`,
    )
  }
  return errors
}
