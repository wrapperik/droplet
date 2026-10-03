import { z } from 'zod'

// What a saved palette looks like. Kept apart from the browser storage code so the server can use the type too.
// Everything read back is validated, because storage can hold anything.
const placementSchema = z.object({
  id: z.string(),
  col: z.number().int().min(-1).max(23), // -1 means "start after the previous item"
  row: z.number().int().min(0),
  w: z.number().int().min(1).max(24),
})

export const paletteSaveSchema = z.object({
  blocks: z
    .array(
      z.object({
        id: z.number().int(),
        hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        role: z.enum(['primary', 'accent', 'background', 'text']).optional(),
        locked: z.boolean().optional(),
        name: z.string().max(60).optional(),
        note: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(8),
  layout: z.array(placementSchema),
  // Which version each toolbar is on (0 is the default), by item id.
  sizes: z.record(z.string(), z.number().int().min(0).max(3)).optional(),
  // Components taken off the screen, by item id.
  hidden: z.array(z.string()).optional(),
  savedAt: z.string(),
})

export type PaletteSave = z.infer<typeof paletteSaveSchema>
