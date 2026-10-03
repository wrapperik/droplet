import { paletteSaveSchema, type PaletteSave } from './paletteSave.ts'

// Stand-in for the project's saved memory until Supabase exists. Saved per project, in this browser.
export { paletteSaveSchema, type PaletteSave } from './paletteSave.ts'

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
