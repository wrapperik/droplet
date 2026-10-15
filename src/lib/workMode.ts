// How a task opens. In Guide mode the founder is shown one part of the task at a time, in the middle of the screen, until it is finished.
// In Workspace mode every part of the task is in the panel at once. The founder chooses
// in the menu beside the message box, and the choice stays until they change it. It is kept per device, like the theme.
export type WorkMode = 'guide' | 'workspace'

export const WORK_MODE_STORAGE_KEY = 'droplet-work-mode'

// New founders start guided: one step at a time is the easier way in.
export const DEFAULT_WORK_MODE: WorkMode = 'guide'

export const isWorkMode = (value: unknown): value is WorkMode => value === 'guide' || value === 'workspace'

export function readStoredWorkMode(): WorkMode {
  try {
    const stored = window.localStorage.getItem(WORK_MODE_STORAGE_KEY)
    if (isWorkMode(stored)) return stored
  } catch {
    // Storage can be blocked (private windows, site settings). Fall back to the default.
  }
  return DEFAULT_WORK_MODE
}

export function storeWorkMode(mode: WorkMode) {
  try {
    window.localStorage.setItem(WORK_MODE_STORAGE_KEY, mode)
  } catch {
    // Not kept. The choice still applies for this visit.
  }
}
