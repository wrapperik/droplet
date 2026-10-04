import { emptyMemory } from './projectMemory.ts'
import { memorySchema, type ProjectMemory } from './memorySave.ts'

// Stand-in for the project's memory in Supabase (`memory_entries`) until it exists. Kept per project, in this browser only.
const keyFor = (projectId: string) => `droplet-project-${projectId}-memory`

export function loadMemory(projectId: string): ProjectMemory {
  try {
    const raw = window.localStorage.getItem(keyFor(projectId))
    if (!raw) return emptyMemory()
    const parsed = memorySchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : emptyMemory()
  } catch {
    return emptyMemory()
  }
}

// Returns false when the browser refused to store it, so the interface can say so honestly.
export function saveMemory(projectId: string, memory: ProjectMemory): boolean {
  try {
    window.localStorage.setItem(keyFor(projectId), JSON.stringify(memory))
    return true
  } catch {
    return false
  }
}

export function clearMemory(projectId: string) {
  try {
    window.localStorage.removeItem(keyFor(projectId))
  } catch {
    // Nothing to clear.
  }
}
