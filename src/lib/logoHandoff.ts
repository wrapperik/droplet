import { containsPrivateDetail } from './facts.ts'
import { COLOUR_ROLES, type ColourRole } from './palette.ts'

// The logo handoff. Droplet does not make logos, so this is everything a founder needs to make one somewhere else and bring it back: the brief,
// the colours and fonts to ask for, the files to ask for, a place to start, and the rules for the file that comes back. Worked out in code from what
// the project holds: the model supplies words for the brief and never a colour, a size or a link.
//
// Kept free of anything from the interface, so the server and the tests can use it.

// The free tools the handoff points to, opened in a new tab. Droplet never embeds them (their sign-in does not work inside another app).
export const LOGO_TOOLS = [
  { id: 'canva', name: 'Canva', url: 'https://www.canva.com/create/logos/', note: 'The more familiar of the two. Free plan, logo templates.' },
  { id: 'adobe', name: 'Adobe Express', url: 'https://www.adobe.com/express/create/logo', note: 'Free plan, logo maker with templates.' },
] as const

// The files to ask the tool for, and the reason for each.
export const LOGO_FORMATS = [
  { id: 'png', label: 'Transparent PNG', detail: 'At least 2000 pixels wide, with no background, so it sits on any colour. A free plan may not allow transparency: a white background is fine to start with.' },
  { id: 'svg', label: 'SVG, if the tool offers it', detail: 'Stays sharp at any size. Often a paid option; skip it if it is.' },
  { id: 'variants', label: 'A light and a dark version', detail: 'Dark lettering for light backgrounds, light lettering for dark ones.' },
  { id: 'square', label: 'A square version', detail: 'At least 800 by 800 pixels, for profile pictures and avatars.' },
] as const

// Fonts to start from when the founder has not chosen any. Droplet has no font tool yet, so these are suggestions and are labelled as such: pairs
// of a heading face and a plain body face, all common in free design tools (the tool may not have every one, so check).
export const SUGGESTED_FONT_PAIRS: { heading: string; body: string }[] = [
  { heading: 'Montserrat', body: 'Open Sans' },
  { heading: 'Playfair Display', body: 'Lato' },
  { heading: 'DM Serif Display', body: 'DM Sans' },
]

export type SpecColour = { hex: string; role: ColourRole | null; roleLabel: string | null }

export type LogoSpec = {
  colours: SpecColour[]
  // The fonts to ask for, and whether the founder chose them or they are Droplet's suggestion.
  fonts: string[]
  fontsFrom: 'chosen' | 'suggested'
  formats: typeof LOGO_FORMATS
  tools: typeof LOGO_TOOLS
}

type SavedColour = { hex: string; role?: ColourRole | null }

const roleLabelOf = (role: ColourRole | null | undefined) => COLOUR_ROLES.find((entry) => entry.id === role)?.label ?? null

// The colours of the saved palette, in the order saved, with the roles the founder gave them. These come from what is saved and from nothing the
// model said.
export function specColours(palette: { blocks: SavedColour[] } | null | undefined): SpecColour[] {
  return (palette?.blocks ?? []).map((block) => ({ hex: block.hex.toUpperCase(), role: block.role ?? null, roleLabel: roleLabelOf(block.role) }))
}

// The fonts the founder chose (the `brand.fonts` fact, in their words), or a suggested pair. A font the model suggests in a brief is passed in as
// `proposed` and used only when the founder has chosen none.
export function specFonts(chosen: string | undefined, proposed: string[] = []): { fonts: string[]; from: 'chosen' | 'suggested' } {
  const mine = (chosen ?? '').trim()
  if (mine !== '') return { fonts: [mine], from: 'chosen' }
  const given = proposed.map((font) => font.trim()).filter((font) => font !== '')
  if (given.length > 0) return { fonts: given.slice(0, 2), from: 'suggested' }
  const pair = SUGGESTED_FONT_PAIRS[0]
  return { fonts: [pair.heading, pair.body], from: 'suggested' }
}

export function logoSpec(input: { palette: { blocks: SavedColour[] } | null | undefined; fontsFact?: string; proposedFonts?: string[] }): LogoSpec {
  const { fonts, from } = specFonts(input.fontsFact, input.proposedFonts)
  return { colours: specColours(input.palette), fonts, fontsFrom: from, formats: LOGO_FORMATS, tools: LOGO_TOOLS }
}

// ---- The brief ----

// What the model writes for a brief: words only.
export type BriefWords = { does: string; feel: string[]; usedFor: string }

export const colourLine = (colour: SpecColour) => (colour.roleLabel ? `${colour.roleLabel} ${colour.hex}` : colour.hex)

// One line of a spec panel or brief that can be copied on its own.
export type SpecRow = { id: string; label: string; value: string }

// The rows of the spec panel, each copyable: colours, fonts, then the files to ask for.
export function specRows(spec: LogoSpec): SpecRow[] {
  return [
    { id: 'colours', label: 'Colours', value: spec.colours.length === 0 ? 'No palette is saved yet.' : spec.colours.map(colourLine).join(', ') },
    { id: 'fonts', label: spec.fontsFrom === 'chosen' ? 'Fonts' : 'Fonts (suggested)', value: spec.fonts.join(' and ') },
    ...spec.formats.map((format) => ({ id: format.id, label: format.label, value: `${format.label}. ${format.detail}` })),
  ]
}

// The brief as plain text, for Copy all. Hex codes are the saved palette's.
export function briefText(input: { name: string; words: BriefWords; spec: LogoSpec }): string {
  const { name, words, spec } = input
  const lines = [
    `Logo brief${name.trim() === '' ? '' : ` for ${name.trim()}`}`,
    `What it does: ${words.does}`,
    `The feel: ${words.feel.join(', ')}`,
    `Where it will be used: ${words.usedFor}`,
    `Colours: ${spec.colours.length === 0 ? 'no palette saved yet' : spec.colours.map(colourLine).join(', ')}`,
    `Fonts: ${spec.fonts.join(' and ')}${spec.fontsFrom === 'suggested' ? ' (suggested)' : ''}`,
    'Files to ask for:',
    ...spec.formats.map((format) => `- ${format.label}`),
  ]
  return lines.join('\n')
}

// The spec on its own, for the handoff card's Copy all.
export function specText(input: { name: string; spec: LogoSpec }): string {
  const rows = specRows(input.spec)
  return [`Logo spec${input.name.trim() === '' ? '' : ` for ${input.name.trim()}`}`, ...rows.map((row) => `${row.label}: ${row.value}`)].join('\n')
}

const HEX_IN_TEXT = /#[0-9a-f]{3,8}\b/i

// Problems with the words of a brief that the shape cannot say. A colour the model wrote would not be the palette's, and a private detail has no
// place in text that is sent on.
export function checkBriefWords(words: BriefWords): string[] {
  const errors: string[] = []
  const fields: [string, string][] = [
    ['does', words.does],
    ['feel', words.feel.join(' ')],
    ['usedFor', words.usedFor],
  ]
  for (const [field, text] of fields) {
    if (HEX_IN_TEXT.test(text)) errors.push(`brief.${field}: leave hex codes out. The app adds the colours from the saved palette.`)
    if (/^\s*\[.*\]\s*$/.test(text)) errors.push(`brief.${field}: write the actual words for this founder, not a description in square brackets.`)
    if (containsPrivateDetail(text)) errors.push(`brief.${field}: it holds a private detail (an address, a phone number, an email or a bank detail). Leave it out.`)
  }
  return errors
}

// ---- The file that comes back ----

export const LOGO_MAX_BYTES = 1_000_000

export type LogoKind = 'png' | 'svg'

export type LogoCheck = { ok: true; kind: LogoKind } | { ok: false; reason: string }

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const MEGABYTE = 1_000_000

// Whether a file can be the logo, from what the browser says about it: a PNG or an SVG, not empty, not over the limit. The reason is in the app's
// own words and says what to do.
export function checkLogoFile(file: { name: string; type: string; size: number }): LogoCheck {
  const name = file.name.toLowerCase()
  const kind: LogoKind | null = file.type === 'image/png' || name.endsWith('.png') ? 'png' : file.type === 'image/svg+xml' || name.endsWith('.svg') ? 'svg' : null
  if (kind === null) return { ok: false, reason: 'That file is not a PNG or an SVG. Download the logo from the tool as a PNG (or an SVG) and add that.' }
  if (file.size === 0) return { ok: false, reason: 'That file is empty. Download the logo again and add the new file.' }
  if (file.size > LOGO_MAX_BYTES) return { ok: false, reason: `That file is ${(file.size / MEGABYTE).toFixed(1)} MB. The limit is ${LOGO_MAX_BYTES / MEGABYTE} MB: download it at a smaller size, or as an SVG.` }
  return { ok: true, kind }
}

// Whether the bytes are what the name says. A file renamed to .png is not a PNG, and an SVG that carries a script is not taken.
export function checkLogoContent(kind: LogoKind, bytes: Uint8Array): LogoCheck {
  if (kind === 'png') {
    const isPng = PNG_SIGNATURE.every((byte, at) => bytes[at] === byte)
    return isPng ? { ok: true, kind } : { ok: false, reason: 'That file says it is a PNG but is not one. Download the logo again as a PNG.' }
  }
  const text = new TextDecoder().decode(bytes)
  if (!/<svg[\s>]/i.test(text)) return { ok: false, reason: 'That file says it is an SVG but is not one. Download the logo again as an SVG, or use the PNG.' }
  if (/<script[\s>]/i.test(text) || /\son\w+\s*=/i.test(text)) return { ok: false, reason: 'That SVG contains a script, which Droplet does not take in. Download it again, or use the PNG.' }
  return { ok: true, kind }
}
