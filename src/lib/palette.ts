import { contrastLevel, contrastRatio, hexToRgb, relativeLuminance, rgbToHsv, type ContrastLevel } from './colour.ts'

// What a colour is for. The preview and the contrast checks read these, so "text on background" means something.
export type ColourRole = 'primary' | 'accent' | 'background' | 'text'

export const COLOUR_ROLES: { id: ColourRole; label: string }[] = [
  { id: 'primary', label: 'Primary' },
  { id: 'accent', label: 'Accent' },
  { id: 'background', label: 'Background' },
  { id: 'text', label: 'Text' },
]

// `locked` keeps a colour as it is when Generate fills in the others.
// `name` and `note` come from the composer: a short name for the colour and one sentence on why it was chosen. They
// describe the colour as it was proposed, so they are dropped as soon as the colour is changed.
export type PaletteBlock = { id: number; hex: string; role?: ColourRole; locked?: boolean; name?: string; note?: string }

// The block with a different colour. The composer's name and note described the old colour, so they go with it.
export function withHex(block: PaletteBlock, hex: string): PaletteBlock {
  const copy = { ...block, hex }
  delete copy.name
  delete copy.note
  return copy
}

// Gives a colour a role, or clears it with null. A role belongs to one colour, so it moves if another held it.
export function assignRole(blocks: PaletteBlock[], id: number, role: ColourRole | null): PaletteBlock[] {
  return blocks.map((block) => {
    if (block.id === id) return role ? { ...withoutRole(block), role } : withoutRole(block)
    if (role && block.role === role) return withoutRole(block)
    return block
  })
}

function withoutRole(block: PaletteBlock): PaletteBlock {
  const copy = { ...block }
  delete copy.role
  return copy
}

export type ResolvedRole = {
  hex: string
  blockId: number
  // True when the founder chose it. False when it was suggested from the colours, so the interface can say so.
  chosen: boolean
}

export type ResolvedRoles = Record<ColourRole, ResolvedRole>

const luminance = (block: PaletteBlock) => relativeLuminance(hexToRgb(block.hex))
const vividness = (block: PaletteBlock) => {
  const { s, v } = rgbToHsv(hexToRgb(block.hex))
  return s * v
}
const ratioBetween = (a: PaletteBlock, b: PaletteBlock) => contrastRatio(hexToRgb(a.hex), hexToRgb(b.hex))

function best(pool: PaletteBlock[], score: (block: PaletteBlock) => number): PaletteBlock | undefined {
  return pool.reduce<PaletteBlock | undefined>((winner, block) => (!winner || score(block) > score(winner) ? block : winner), undefined)
}

// Every role gets a colour. The founder's own choices come first. The rest are suggested: the lightest colour as
// the background, the one that reads best on it as the text, then the most vivid two as primary and accent.
export function resolveRoles(blocks: PaletteBlock[]): ResolvedRoles {
  const chosen = new Map<ColourRole, PaletteBlock>()
  for (const block of blocks) if (block.role) chosen.set(block.role, block)

  const taken = new Set<number>([...chosen.values()].map((block) => block.id))
  const free = () => blocks.filter((block) => !taken.has(block.id))

  const lightest = best(blocks, luminance)!
  const darkest = best(blocks, (block) => -luminance(block))!

  let background = chosen.get('background')
  let text = chosen.get('text')
  if (!background && !text) {
    background = best(free(), luminance)
    if (background) taken.add(background.id)
    text = best(free(), (block) => -luminance(block))
    if (text) taken.add(text.id)
  } else if (!background && text) {
    background = best(free(), (block) => ratioBetween(block, text!))
    if (background) taken.add(background.id)
  } else if (background && !text) {
    text = best(free(), (block) => ratioBetween(block, background!))
    if (text) taken.add(text.id)
  }

  const backgroundBlock = background ?? lightest
  const textBlock = text ?? darkest
  const primary = chosen.get('primary') ?? best(free(), vividness)
  if (primary) taken.add(primary.id)
  const primaryBlock = primary ?? best(blocks, vividness)!
  const accent = chosen.get('accent') ?? best(free(), vividness)
  const accentBlock = accent ?? primaryBlock

  const resolved = (role: ColourRole, block: PaletteBlock): ResolvedRole => ({
    hex: block.hex,
    blockId: block.id,
    chosen: chosen.get(role)?.id === block.id,
  })

  return {
    primary: resolved('primary', primaryBlock),
    accent: resolved('accent', accentBlock),
    background: resolved('background', backgroundBlock),
    text: resolved('text', textBlock),
  }
}

export type PairResult = { ratio: number; level: ContrastLevel }

// Contrast is the same whichever colour is the text, so one result covers a pair.
export function pairResult(a: string, b: string): PairResult {
  const ratio = contrastRatio(hexToRgb(a), hexToRgb(b))
  return { ratio, level: contrastLevel(ratio) }
}

// How many of the distinct pairs of colours reach AA (4.5:1) for body text.
export function summarisePairs(blocks: PaletteBlock[]): { total: number; passing: number } {
  let total = 0
  let passing = 0
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      total += 1
      if (pairResult(blocks[i].hex, blocks[j].hex).level !== 'fail') passing += 1
    }
  }
  return { total, passing }
}
