import { z } from 'zod'

// What a saved palette looks like. Kept apart from the browser storage code so the server can use the type too.
// Everything read back is validated, because storage can hold anything.
const placementSchema = z.object({
  id: z.string(),
  col: z.number().int().min(-1).max(23), // -1 means "start after the previous item"
  row: z.number().int().min(0),
  w: z.number().int().min(1).max(24),
})

const blocksSchema = z
  .array(
    z.object({
      id: z.number().int(),
      hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      role: z.enum(['primary', 'accent', 'background', 'text']).optional(),
      locked: z.boolean().optional(),
      name: z.string().max(60).optional(),
      note: z.string().max(200).optional(),
      starred: z.boolean().optional(),
    }),
  )
  .min(1)
  .max(8)

// A palette the founder gave a name and kept, so it can be opened again later. The names are kept apart by `namedPalettes.ts`; a stored list is not trusted to
// have kept to that, only to be the right shape.
export const NAMED_PALETTES_MAX = 20
export const PALETTE_NAME_MAX = 60
export const namedPaletteSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(PALETTE_NAME_MAX),
  blocks: blocksSchema,
  savedAt: z.string(),
})
export type NamedPalette = z.infer<typeof namedPaletteSchema>

export const paletteSaveSchema = z.object({
  blocks: blocksSchema,
  // The palettes the founder named and kept (at most 20). Older saves do not have it.
  palettes: z.array(namedPaletteSchema).max(NAMED_PALETTES_MAX).optional(),
  // Kept for older saves and still written for now; opening a workspace ignores it, so a save without it is fine.
  layout: z.array(placementSchema).optional(),
  // Older saves only (no longer written or applied): the order of the tools in the toolbar, by id.
  tools: z.array(z.string()).optional(),
  // Older saves only: tools that were dragged out of the toolbar and are windows, by id.
  expanded: z.array(z.string()).optional(),
  // Components taken off the screen, by item id.
  hidden: z.array(z.string()).optional(),
  // The brand guide's other choices: a typeface pair (by its id in `brandType.ts`) and up to three words for how the brand sounds. Older saves do not have them.
  fonts: z.string().max(40).optional(),
  voice: z.array(z.string().max(30)).max(3).optional(),
  savedAt: z.string(),
  // When the saved palette was last exported as a brand sheet, if it has been.
  exportedAt: z.string().optional(),
})

export type PaletteSave = z.infer<typeof paletteSaveSchema>
