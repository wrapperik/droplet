import { paletteSaveSchema, type PaletteSave } from './paletteSave.ts'
import { documentStorage } from './storage.ts'

// The project's saved palette, through the document storage (this browser for now, a database later). Every call is asynchronous.
export { paletteSaveSchema, type PaletteSave } from './paletteSave.ts'

export async function loadPalette(projectId: string): Promise<PaletteSave | null> {
  const parsed = paletteSaveSchema.safeParse(await documentStorage().read(projectId, 'palette'))
  return parsed.success ? parsed.data : null
}

// Null when it could not be stored, so the interface can say so honestly.
export async function savePalette(projectId: string, data: Omit<PaletteSave, 'savedAt'>): Promise<PaletteSave | null> {
  const save: PaletteSave = { ...data, savedAt: new Date().toISOString() }
  return (await documentStorage().write(projectId, 'palette', save)) ? save : null
}

export function clearPalette(projectId: string): Promise<void> {
  return documentStorage().remove(projectId, 'palette')
}
