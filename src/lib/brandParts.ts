import { starterBlocks } from '../compose/fallback.ts'
import { pairResult, type PairResult, type PaletteBlock, type ResolvedRoles } from './palette.ts'

// The parts of the brand workspace, in the order they are shown, with the names and one-line leads the task bar and the panel share (manifesto principle 3).
// The ticks are worked out here, in code, from the palette alone.

export const BRAND_PARTS = ['colours', 'typography', 'voice', 'plan'] as const
export type BrandPartId = (typeof BRAND_PARTS)[number]

export const BRAND_TITLES: Record<BrandPartId, string> = { colours: 'Colours', typography: 'Typography', voice: 'Voice', plan: 'Brand plan' }

export const BRAND_LEADS: Record<BrandPartId, string> = {
  colours: 'Move the colours on the wheel and give each one a role. The circles show whether text reads on each colour.',
  typography: 'Choose the pair of typefaces your business will use: one for headings, one for reading.',
  voice: 'Pick up to three words for how your business sounds when it writes to a client.',
  plan: 'Everything you decided, on one page. Download it as your brand sheet.',
}

// The sentence under the Roles heading on the Colours screen, and the tip beside the Contrast heading.
export const ROLES_LEAD = 'Say which colour is the main one, the accent, the background and the text, so the preview and the brand sheet use them properly.'
export const CONTRAST_LEAD = 'How easy the text is to read on each colour. It is worked out for you, from the colours you chose.'

// The pairs of roles that matter, each with the colour on top and the colour behind it.
export type KeyPair = { id: string; label: string; foreground: string; background: string } & PairResult

export function keyPairs(roles: ResolvedRoles): KeyPair[] {
  const pair = (id: string, label: string, foreground: string, background: string): KeyPair => ({ id, label, foreground, background, ...pairResult(foreground, background) })
  return [
    pair('text-background', 'Text on background', roles.text.hex, roles.background.hex),
    pair('primary-background', 'Primary on background', roles.primary.hex, roles.background.hex),
    pair('accent-background', 'Accent on background', roles.accent.hex, roles.background.hex),
  ]
}

// Whether the palette is something other than the untouched starter palette: the colours, in order, are not the starter's.
export function paletteIsStarter(blocks: PaletteBlock[]): boolean {
  const starter = starterBlocks()
  return blocks.length === starter.length && blocks.every((block, index) => block.hex.toUpperCase() === starter[index].hex.toUpperCase())
}

// Which parts are complete. Colours: the founder has made the palette their own. Typography: a pair is chosen. Voice: at least one word is chosen. Brand plan:
// all three before it are done.
export type BrandChoices = { fonts: string | null; voice: string[] }

export function brandPartsDone(blocks: PaletteBlock[], choices: BrandChoices): Record<BrandPartId, boolean> {
  const colours = !paletteIsStarter(blocks)
  const typography = choices.fonts !== null
  const voice = choices.voice.length > 0
  return { colours, typography, voice, plan: colours && typography && voice }
}
