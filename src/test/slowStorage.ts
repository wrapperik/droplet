import type { DocKind, DocumentStorage } from '../lib/storage.ts'

// A stand-in for a database: documents in a map, each read and write taking a moment, as they would over a network.
export function slowMemoryStorage(delayMs = 5) {
  const documents = new Map<string, unknown>()
  const calls: string[] = []
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs))
  const key = (projectId: string, kind: DocKind) => `${projectId}/${kind}`
  const driver: DocumentStorage = {
    async read(projectId, kind) {
      calls.push(`read ${key(projectId, kind)}`)
      await wait()
      return documents.has(key(projectId, kind)) ? structuredClone(documents.get(key(projectId, kind))) : null
    },
    async write(projectId, kind, value) {
      calls.push(`write ${key(projectId, kind)}`)
      await wait()
      documents.set(key(projectId, kind), structuredClone(value))
      return true
    },
    async remove(projectId, kind) {
      calls.push(`remove ${key(projectId, kind)}`)
      await wait()
      documents.delete(key(projectId, kind))
    },
  }
  return { driver, documents, calls }
}
