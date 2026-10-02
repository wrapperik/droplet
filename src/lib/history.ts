// Undo and redo for a value that changes in steps. Edits made one after another under the same key within a
// short time count as one step, so dragging across a colour spectrum is undone in one go, not pixel by pixel.
export type History<T> = {
  past: T[]
  present: T
  future: T[]
  key: string | null
  at: number
}

const LIMIT = 100
export const MERGE_WINDOW_MS = 800

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], key: null, at: 0 }
}

export function commit<T>(history: History<T>, next: T, key: string | null = null, now: number = Date.now()): History<T> {
  if (next === history.present) return history
  if (key !== null && key === history.key && now - history.at < MERGE_WINDOW_MS) {
    return { ...history, present: next, at: now }
  }
  return { past: [...history.past, history.present].slice(-LIMIT), present: next, future: [], key, at: now }
}

export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history
  const present = history.past[history.past.length - 1]
  return { past: history.past.slice(0, -1), present, future: [history.present, ...history.future], key: null, at: 0 }
}

export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history
  const [present, ...future] = history.future
  return { past: [...history.past, history.present], present, future, key: null, at: 0 }
}

export const canUndo = (history: History<unknown>) => history.past.length > 0
export const canRedo = (history: History<unknown>) => history.future.length > 0
