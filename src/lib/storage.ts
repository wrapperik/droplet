// Where a project's saved documents live. Every store (palette, board, invoice arrangement, memory, chats) reads and writes through one
// driver, and every read and write is asynchronous, so moving from this browser to a database is a change of driver and nothing else:
// nothing above here may assume that a read is instant, or that it cannot fail.
//
// A document is one JSON value per project and kind. What is read back is `unknown`, because storage can hold anything: each store
// validates it with its own Zod schema.

// `notes` is Droplet's notebook on the project: an index of what the workspaces hold and a digest of each (see notes.ts). `logo` is the logo a
// founder made in another tool and brought back (see logoSave.ts).
export type DocKind = 'palette' | 'board' | 'invoice' | 'memory' | 'chats' | 'notes' | 'logo'

export interface DocumentStorage {
  // The saved value, or null when there is none. A value that cannot be read is also null: the driver never throws.
  read(projectId: string, kind: DocKind): Promise<unknown>
  // Whether it was stored, so the interface can say so honestly.
  write(projectId: string, kind: DocKind, value: unknown): Promise<boolean>
  remove(projectId: string, kind: DocKind): Promise<void>
}

const LOCAL_PREFIX = 'droplet-project-'
const keyFor = (projectId: string, kind: DocKind) => `${LOCAL_PREFIX}${projectId}-${kind}`

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

// Removes every project's saved documents from this browser, whichever projects there were, for "Delete everything on this device". Only
// documents: the theme and the work mode are preferences of the device and not the founder's work. True if nothing could be left behind.
export function removeAllLocalDocuments(): boolean {
  try {
    const stale: string[] = []
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index)
      if (key?.startsWith(LOCAL_PREFIX)) stale.push(key)
    }
    for (const key of stale) window.localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

let current: DocumentStorage = localDocumentStorage

export const documentStorage = (): DocumentStorage => current

// Swaps the driver (a database later, a stand-in in a test). Returns the one it replaced, so a test can put it back.
export function setDocumentStorage(driver: DocumentStorage): DocumentStorage {
  const before = current
  current = driver
  return before
}

// Told after a document was saved, so Droplet's notes on the project can be brought up to date. The stores that hold what a workspace saves say so; nothing
// else does. A listener must not wait for anything, and one that throws does not stop the others.
export type SavedListener = (projectId: string, kind: DocKind) => void
const savedListeners = new Set<SavedListener>()

export function onDocumentSaved(listener: SavedListener): () => void {
  savedListeners.add(listener)
  return () => void savedListeners.delete(listener)
}

export function documentWasSaved(projectId: string, kind: DocKind): void {
  for (const listener of savedListeners) {
    try {
      listener(projectId, kind)
    } catch {
      // A listener's trouble is its own.
    }
  }
}
