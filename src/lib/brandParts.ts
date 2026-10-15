import { starterBlocks } from '../compose/fallback.ts'
import { COLOUR_ROLES, pairResult, resolveRoles, type PairResult, type PaletteBlock, type ResolvedRoles } from './palette.ts'

// The parts of the brand workspace, in the order they are shown, with the names and one-line leads the task bar and the panel share (manifesto principle 3).
// The ticks are worked out here, in code, from the palette alone.

export const BRAND_PARTS = ['colours', 'roles', 'contrast'] as const
export type BrandPartId = (typeof BRAND_PARTS)[number]

export const BRAND_TITLES: Record<BrandPartId, string> = { colours: 'Colours', roles: 'Roles', contrast: 'Contrast' }

export const BRAND_LEADS: Record<BrandPartId, string> = {
  colours: 'Pick a colour on the wheel, type its code, or let Droplet suggest colours that go with it.',
  roles: 'Say which colour is the main one, the accent, the background and the text, so the preview and the brand sheet use them properly.',
  contrast: 'How easy the text is to read on the background. It is worked out for you, from the colours you chose.',
}

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

// Which parts are complete. Colours: the founder has made the palette their own. Roles: every role has been chosen, not only suggested from the colours (the
// starter palette arrives with its roles set, which are not the founder's choice, so it counts only once the palette is no longer the untouched starter).
// Contrast: the text reads on the background at AA.
export function brandPartsDone(blocks: PaletteBlock[]): Record<BrandPartId, boolean> {
  const roles = resolveRoles(blocks)
  const own = !paletteIsStarter(blocks)
  return {
    colours: own,
    roles: own && COLOUR_ROLES.every((role) => roles[role.id].chosen),
    contrast: pairResult(roles.text.hex, roles.background.hex).level !== 'fail',
  }
}
