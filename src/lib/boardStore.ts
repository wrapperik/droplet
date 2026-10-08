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
export async function saveBoard(projectId: string, data: Omit<BoardSave, 'savedAt'>): Promise<BoardSave | null> {
  const save: BoardSave = { ...data, savedAt: new Date().toISOString() }
  if (!(await documentStorage().write(projectId, 'board', save))) return null
  documentWasSaved(projectId, 'board')
  return save
}

export function clearBoard(projectId: string): Promise<void> {
  return documentStorage().remove(projectId, 'board')
}

// The board workspace for a project: the saved board and arrangement if there is one, otherwise an empty board.
export async function openBoardForProject(projectId: string): Promise<BoardState> {
  const saved = await loadBoard(projectId)
  return openBoard(saved?.items ?? [], saved)
}
