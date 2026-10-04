import { boardSaveSchema, type BoardSave } from './boardSave.ts'
import { openBoard, type BoardState } from './boardState.ts'

// Stand-in for the project's saved memory until Supabase exists. The board is saved per project, in this browser, when the founder
// presses Save, and not before.
export { boardSaveSchema, type BoardSave } from './boardSave.ts'

const keyFor = (projectId: string) => `droplet-project-${projectId}-board`

export function loadBoard(projectId: string): BoardSave | null {
  try {
    const raw = window.localStorage.getItem(keyFor(projectId))
    if (!raw) return null
    const parsed = boardSaveSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// Returns null when the browser refused to store it, so the interface can say so honestly.
export function saveBoard(projectId: string, data: Omit<BoardSave, 'savedAt'>): BoardSave | null {
  const save: BoardSave = { ...data, savedAt: new Date().toISOString() }
  try {
    window.localStorage.setItem(keyFor(projectId), JSON.stringify(save))
    return save
  } catch {
    return null
  }
}

export function clearBoard(projectId: string) {
  try {
    window.localStorage.removeItem(keyFor(projectId))
  } catch {
    // Nothing to clear.
  }
}

// The board workspace for a project: the saved board and arrangement if there is one, otherwise an empty board.
export function openBoardForProject(projectId: string): BoardState {
  const saved = loadBoard(projectId)
  return openBoard(saved?.items ?? [], saved, saved?.summary)
}
