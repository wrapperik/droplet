// Where a project's saved documents live. Every store (palette, board, invoice arrangement, memory, chats) reads and writes through one
// driver, and every read and write is asynchronous, so moving from this browser to a database is a change of driver and nothing else:
// nothing above here may assume that a read is instant, or that it cannot fail.
//
// A document is one JSON value per project and kind. What is read back is `unknown`, because storage can hold anything: each store
// validates it with its own Zod schema.

export type DocKind = 'palette' | 'board' | 'invoice' | 'memory' | 'chats'

export interface DocumentStorage {
  // The saved value, or null when there is none. A value that cannot be read is also null: the driver never throws.
  read(projectId: string, kind: DocKind): Promise<unknown>
  // Whether it was stored, so the interface can say so honestly.
  write(projectId: string, kind: DocKind, value: unknown): Promise<boolean>
  remove(projectId: string, kind: DocKind): Promise<void>
}

const keyFor = (projectId: string, kind: DocKind) => `droplet-project-${projectId}-${kind}`

// This browser's local storage, under the keys the app has always used, so what was saved before is still there.
export const localDocumentStorage: DocumentStorage = {
  async read(projectId, kind) {
    try {
      const raw = window.localStorage.getItem(keyFor(projectId, kind))
      return raw === null ? null : (JSON.parse(raw) as unknown)
    } catch {
      return null
    }
  },
  async write(projectId, kind, value) {
    try {
      window.localStorage.setItem(keyFor(projectId, kind), JSON.stringify(value))
      return true
    } catch {
      return false
    }
  },
  async remove(projectId, kind) {
    try {
      window.localStorage.removeItem(keyFor(projectId, kind))
    } catch {
      // Nothing to remove.
    }
  },
}

let current: DocumentStorage = localDocumentStorage

export const documentStorage = (): DocumentStorage => current

// Swaps the driver (a database later, a stand-in in a test). Returns the one it replaced, so a test can put it back.
export function setDocumentStorage(driver: DocumentStorage): DocumentStorage {
  const before = current
  current = driver
  return before
}
