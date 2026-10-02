import { hexToRgb } from './colour.ts'
import { COLOUR_ROLES, pairResult, summarisePairs, type PaletteBlock, type ResolvedRoles } from './palette.ts'

const roleLabel = (block: PaletteBlock) => COLOUR_ROLES.find((role) => role.id === block.role)?.label ?? null

export type BrandSheetData = {
  title: string
  date: string
  colours: { name: string; role: string | null; hex: string; rgb: string }[]
  roles: { label: string; hex: string; chosen: boolean }[]
  keyPair: { textHex: string; backgroundHex: string; ratio: string; verdict: string }
  summary: string
}

// Everything the one-page brand sheet says, worked out here in code. The PDF only lays it out.
export function brandSheetData(blocks: PaletteBlock[], roles: ResolvedRoles, projectName: string, now: Date): BrandSheetData {
  const key = pairResult(roles.text.hex, roles.background.hex)
  const { total, passing } = summarisePairs(blocks)
  return {
    title: `${projectName} colour palette`,
    date: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(now),
    colours: blocks.map((block, index) => {
      const { r, g, b } = hexToRgb(block.hex)
      return { name: `Colour ${index + 1}`, role: roleLabel(block), hex: block.hex, rgb: `${r}, ${g}, ${b}` }
    }),
    roles: COLOUR_ROLES.map((role) => ({ label: role.label, hex: roles[role.id].hex, chosen: roles[role.id].chosen })),
    keyPair: {
      textHex: roles.text.hex,
      backgroundHex: roles.background.hex,
      ratio: `${key.ratio.toFixed(1)}:1`,
      verdict: key.level === 'fail' ? 'Fails AA' : `Passes ${key.level}`,
    },
    summary: `${passing} of ${total} pairs of colours reach AA (4.5:1) for body text.`,
  }
}

export const brandSheetFilename = (projectName: string) =>
  `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'}-colour-palette.pdf`
