import { paletteSaveSchema, type PaletteSave } from './paletteSave.ts'
import { documentStorage, documentWasSaved } from './storage.ts'

// The project's saved palette, through the document storage (this browser for now, a database later). Every call is asynchronous.
export { paletteSaveSchema, type PaletteSave } from './paletteSave.ts'

export async function loadPalette(projectId: string): Promise<PaletteSave | null> {
  const parsed = paletteSaveSchema.safeParse(await documentStorage().read(projectId, 'palette'))
  return parsed.success ? parsed.data : null
}

// Null when it could not be stored, so the interface can say so honestly.
export async function savePalette(projectId: string, data: Omit<PaletteSave, 'savedAt' | 'exportedAt'>): Promise<PaletteSave | null> {
  // Saving again does not forget that it was exported: when it was is still true.
  const exportedAt = (await loadPalette(projectId))?.exportedAt
  const save: PaletteSave = { ...data, savedAt: new Date().toISOString(), ...(exportedAt ? { exportedAt } : {}) }
  if (!(await documentStorage().write(projectId, 'palette', save))) return null
  documentWasSaved(projectId, 'palette')
  return save
}

// Records that the saved palette was exported. Not a change to the palette, so it is not announced as a save. Null if there is nothing saved or it
// could not be stored.
export async function markPaletteExported(projectId: string, now: string = new Date().toISOString()): Promise<PaletteSave | null> {
  const saved = await loadPalette(projectId)
  if (!saved) return null
  const next: PaletteSave = { ...saved, exportedAt: now }
  return (await documentStorage().write(projectId, 'palette', next)) ? next : null
}

export function clearPalette(projectId: string): Promise<void> {
  return documentStorage().remove(projectId, 'palette')
}
