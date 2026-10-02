import { z } from 'zod'

// Stand-in for the project's saved memory until Supabase exists. Saved per project, in this browser.
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
      }),
    )
    .min(1)
    .max(8),
  layout: z.array(placementSchema),
  savedAt: z.string(),
})

export type PaletteSave = z.infer<typeof paletteSaveSchema>

const keyFor = (projectId: string) => `droplet-project-${projectId}-palette`

export function loadPalette(projectId: string): PaletteSave | null {
  try {
    const raw = window.localStorage.getItem(keyFor(projectId))
    if (!raw) return null
    const parsed = paletteSaveSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// Returns false when the browser refused to store it, so the interface can say so honestly.
export function savePalette(projectId: string, data: Omit<PaletteSave, 'savedAt'>): PaletteSave | null {
  const save: PaletteSave = { ...data, savedAt: new Date().toISOString() }
  try {
    window.localStorage.setItem(keyFor(projectId), JSON.stringify(save))
    return save
  } catch {
    return null
  }
}

export function clearPalette(projectId: string) {
  try {
    window.localStorage.removeItem(keyFor(projectId))
  } catch {
    // Nothing to clear.
  }
}
