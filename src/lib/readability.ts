import { contrastRatio, hexToRgb, hslToRgb, rgbToHex, rgbToHsl } from './colour.ts'
import { assignRole, resolveRoles, type PaletteBlock } from './palette.ts'
import type { WorkspaceAction } from './workspaceState.ts'

// "Make it more readable": when the text does not reach AA (4.5 to 1) on the background, one of the two is moved lighter or darker, keeping its hue and
// saturation, until the pair passes. Worked out in code, never by the model. The text colour moves first; the background moves only if the text cannot.

export const AA_RATIO = 4.5

// The colour with its lightness (HSL) changed and its hue and saturation kept.
function withLightness(hex: string, lightness: number): string {
  const hsl = rgbToHsl(hexToRgb(hex))
  return rgbToHex(hslToRgb({ ...hsl, l: Math.min(1, Math.max(0, lightness)) }))
}

const ratio = (a: string, b: string) => contrastRatio(hexToRgb(a), hexToRgb(b))

// The nearest colour to `hex`, by lightness, that reads on `against` at AA, moving towards whichever of black and white reads better on it. Null if there is none.
export function readableAgainst(hex: string, against: string): string | null {
  if (ratio(hex, against) >= AA_RATIO) return hex
  const towardsWhite = ratio('#FFFFFF', against) >= ratio('#000000', against)
  const start = rgbToHsl(hexToRgb(hex)).l
  const step = towardsWhite ? 0.005 : -0.005
  for (let l = start + step; towardsWhite ? l <= 1.0001 : l >= -0.0001; l += step) {
    const candidate = withLightness(hex, l)
    if (ratio(candidate, against) >= AA_RATIO) return candidate
  }
  return null
}

export type ReadableFix = {
  blocks: PaletteBlock[]
  // Which role's colour moved, and from what to what.
  moved: 'text' | 'background'
  from: string
  to: string
  ratio: number
}

// The palette with the text (or, if that cannot work, the background) moved until the text reads on the background at AA. Null when it already does, or when
// the roles share one colour. If moving the colour would change which colour is suggested for a role, the two roles are set explicitly so the pair stays the pair.
export function makeMoreReadable(blocks: PaletteBlock[]): ReadableFix | null {
  const roles = resolveRoles(blocks)
  const text = roles.text
  const background = roles.background
  if (text.blockId === background.blockId) return null
  if (ratio(text.hex, background.hex) >= AA_RATIO) return null

  const attempts: { moved: 'text' | 'background'; blockId: number; from: string; to: string | null }[] = [
    { moved: 'text', blockId: text.blockId, from: text.hex, to: readableAgainst(text.hex, background.hex) },
    { moved: 'background', blockId: background.blockId, from: background.hex, to: readableAgainst(background.hex, text.hex) },
  ]
  for (const attempt of attempts) {
    if (!attempt.to) continue
    const to = attempt.to
    let next = blocks.map((block) => {
      if (block.id !== attempt.blockId) return block
      const copy = { ...block, hex: to }
      delete copy.name
      delete copy.note
      return copy
    })
    // The roles that were only suggested might now be suggested differently: pin the pair.
    const after = resolveRoles(next)
    if (after.text.blockId !== text.blockId) next = assignRole(next, text.blockId, 'text')
    if (after.background.blockId !== background.blockId) next = assignRole(next, background.blockId, 'background')
    const finalRoles = resolveRoles(next)
    const finalRatio = ratio(finalRoles.text.hex, finalRoles.background.hex)
    if (finalRatio >= AA_RATIO) return { blocks: next, moved: attempt.moved, from: attempt.from, to, ratio: finalRatio }
  }
  return null
}

// The actions that make the fix on the workspace, for one `batch`, so it is one undo step: the colour that moved, and any role that had to be pinned.
export function fixActions(before: PaletteBlock[], fix: ReadableFix): WorkspaceAction[] {
  const actions: WorkspaceAction[] = []
  for (const block of fix.blocks) {
    const old = before.find((candidate) => candidate.id === block.id)
    if (old && old.hex !== block.hex) actions.push({ type: 'set_hex', id: block.id, hex: block.hex })
  }
  for (const block of fix.blocks) {
    const old = before.find((candidate) => candidate.id === block.id)
    if (block.role && old?.role !== block.role) actions.push({ type: 'set_role', id: block.id, role: block.role })
  }
  return actions
}
