import { emptyMemory } from './projectMemory.ts'
import { memorySchema, type ProjectMemory } from './memorySave.ts'
import { documentStorage } from './storage.ts'

// The project's memory (stand-in for `memory_entries`), through the document storage. Every call is asynchronous.
export async function loadMemory(projectId: string): Promise<ProjectMemory> {
  const parsed = memorySchema.safeParse(await documentStorage().read(projectId, 'memory'))
  return parsed.success ? parsed.data : emptyMemory()
}

// False when it could not be stored, so the interface can say so honestly.
export function saveMemory(projectId: string, memory: ProjectMemory): Promise<boolean> {
  return documentStorage().write(projectId, 'memory', memory)
}

export function clearMemory(projectId: string): Promise<void> {
  return documentStorage().remove(projectId, 'memory')
}
