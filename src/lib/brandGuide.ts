import { z } from 'zod'
import { BRAND_LEADS, BRAND_PARTS, paletteIsStarter, type BrandPartId } from './brandParts.ts'
import { flowAdvance, flowBack, flowGoTo, flowJumpTo } from './guideFlow.ts'
import { COLOUR_ROLES, pairResult, resolveRoles, type PaletteBlock } from './palette.ts'

// Guide mode for the brand: the same three parts as Workspace mode (Colours, Roles, Contrast), one at a time, moved through the way the invoice's six are
// (`guideFlow.ts`). The order is the app's, never the model's. Continue is held back only on Colours, until the palette is the founder's; Roles and Contrast are
// never held back (roles have suggestions, and a pair that does not pass is named, not blocked). Finish saves the palette.

export const BRAND_STEPS = BRAND_PARTS
export type BrandStepId = BrandPartId

// Where the founder is in the brand guide: the part on screen, and the furthest part reached (by its place), which they can go back to.
export type BrandProgress = { step: BrandStepId; reached: number }

export const startBrandGuide = (): BrandProgress => ({ step: BRAND_STEPS[0], reached: 0 })

// What the founder has done in the Colours step, held by the workspace so it outlasts a visit to another step: the colours they like, whether the palettes are
// showing, and which set of three.
export type GuidePicks = { favourites: string[]; shown: boolean; round: number }
export const NO_PICKS: GuidePicks = { favourites: [], shown: false, round: 0 }

// The one line under a part's title. Colours asks for something different in Guide mode (colours the founder likes, not a wheel), so it says so; the rest are the same.
export const brandLead = (id: BrandPartId, _guided: boolean): string => BRAND_LEADS[id]

export const brandStepIndex = (step: BrandStepId) => BRAND_STEPS.indexOf(step)

// What holds a part back, in words. Colours: the palette must be the founder's own (changed, or already saved). Typography: a pair chosen. Voice: a word chosen.
export type BrandGuideFacts = {
  blocks: PaletteBlock[]
  // The project already has a saved palette.
  hasSaved: boolean
  // The typeface pair chosen, and the voice words chosen.
  fonts: string | null
  voice: string[]
}

// Whether the founder can leave Colours: they chose a palette here, or changed it some other way, or the project already has one saved.
export const hasOwnPalette = ({ blocks, hasSaved }: BrandGuideFacts) => hasSaved || !paletteIsStarter(blocks)

export function brandBlockers(step: BrandStepId, facts: BrandGuideFacts): string[] {
  if (step === 'colours' && !hasOwnPalette(facts)) return ['Change a colour first, so the palette is yours.']
  if (step === 'typography' && facts.fonts === null) return ['Choose a pair of typefaces first.']
  if (step === 'voice' && facts.voice.length === 0) return ['Pick at least one word for how your brand sounds.']
  return []
}

export function advanceBrand(progress: BrandProgress, facts: BrandGuideFacts): { progress: BrandProgress; blocked: string[] } {
  const blocked = brandBlockers(progress.step, facts)
  return { progress: flowAdvance(BRAND_STEPS, progress, blocked), blocked }
}

export const backBrand = (progress: BrandProgress): BrandProgress => flowBack(BRAND_STEPS, progress)
export const goToBrand = (progress: BrandProgress, step: BrandStepId): BrandProgress => flowGoTo(BRAND_STEPS, progress, step)
export const jumpToBrand = (progress: BrandProgress, step: BrandStepId): BrandProgress => flowJumpTo(BRAND_STEPS, progress, step)

// A finished palette, as the card in the chat shows it: the colours with their roles, and how the text reads on the background. It is kept with the chat. The
// card exports the brand sheet from what is saved, so nothing else about the palette is kept here.
export const paletteResultSchema = z.object({
  kind: z.literal('palette'),
  title: z.string().max(40),
  colours: z
    .array(z.object({ hex: z.string().regex(/^#[0-9A-F]{6}$/), role: z.enum(['primary', 'accent', 'background', 'text']).optional() }))
    .min(2)
    .max(8),
  ratio: z.number().min(1).max(21),
  level: z.enum(['AAA', 'AA', 'fail']),
})
export type PaletteResult = z.infer<typeof paletteResultSchema>

export function paletteResultOf(blocks: PaletteBlock[]): PaletteResult {
  const roles = resolveRoles(blocks)
  const pair = pairResult(roles.text.hex, roles.background.hex)
  // The roles the founder or the app resolved, not only the ones set on a colour.
  const roleOf = (blockId: number) => COLOUR_ROLES.find((role) => roles[role.id].blockId === blockId)?.id
  return {
    kind: 'palette',
    title: 'Brand palette',
    colours: blocks.map((block) => {
      const role = block.role ?? roleOf(block.id)
      return { hex: block.hex.toUpperCase(), ...(role ? { role } : {}) }
    }),
    ratio: Math.round(pair.ratio * 10) / 10 || 1,
    level: pair.level,
  }
}

export function paletteResultMessage(result: PaletteResult): string {
  const count = result.colours.length
  return `The brand palette of ${count} colours is finished and saved. Export the brand sheet from the card to share it, or tell me what to do next.`
}
