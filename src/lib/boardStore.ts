import { boardSaveSchema, type BoardSave } from './boardSave.ts'
import { openBoard, type BoardState } from './boardState.ts'
import { documentStorage, documentWasSaved } from './storage.ts'

// The project's saved board, through the document storage (this browser for now, a database later). Saved when the founder presses Save,
// and not before. Every call is asynchronous.
export { boardSaveSchema, type BoardSave } from './boardSave.ts'

export async function loadBoard(projectId: string): Promise<BoardSave | null> {
  const parsed = boardSaveSchema.safeParse(await documentStorage().read(projectId, 'board'))
  return parsed.success ? parsed.data : null
}

// Null when it could not be stored, so the interface can say so honestly.
export async function saveBoard(projectId: string, data: Omit<BoardSave, 'savedAt' | 'exportedAt'>): Promise<BoardSave | null> {
  // Saving again does not forget that it was exported: when it was is still true.
  const exportedAt = (await loadBoard(projectId))?.exportedAt
  const save: BoardSave = { ...data, savedAt: new Date().toISOString(), ...(exportedAt ? { exportedAt } : {}) }
  if (!(await documentStorage().write(projectId, 'board', save))) return null
  documentWasSaved(projectId, 'board')
  return save
}

// Records that the saved board was exported. Not a change to the board, so it is not announced as a save. Null if there is nothing saved or it could
// not be stored.
export async function markBoardExported(projectId: string, now: string = new Date().toISOString()): Promise<BoardSave | null> {
  const saved = await loadBoard(projectId)
  if (!saved) return null
  const next: BoardSave = { ...saved, exportedAt: now }
  return (await documentStorage().write(projectId, 'board', next)) ? next : null
}

export function clearBoard(projectId: string): Promise<void> {
  return documentStorage().remove(projectId, 'board')
}

// The board workspace for a project: the saved board if there is one, otherwise an empty board.
export async function openBoardForProject(projectId: string): Promise<BoardState> {
  const saved = await loadBoard(projectId)
  return openBoard(saved?.items ?? [])
}
