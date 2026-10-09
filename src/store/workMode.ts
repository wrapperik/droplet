import { create } from 'zustand'
import { readStoredWorkMode, storeWorkMode, type WorkMode } from '../lib/workMode.ts'

type WorkModeState = {
  mode: WorkMode
  setMode: (mode: WorkMode) => void
}

// Guide or Workspace, read once when the app starts and kept on this device whenever it changes.
export const useWorkMode = create<WorkModeState>((set) => ({
  mode: typeof window === 'undefined' ? 'guide' : readStoredWorkMode(),
  setMode: (mode) => {
    storeWorkMode(mode)
    set({ mode })
  },
}))
