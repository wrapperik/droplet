import { describe, expect, it } from 'vitest'
import { createSupabaseDocumentStorage, type DocumentsClient } from './supabaseStorage.ts'

// A stand-in for the Supabase client's query builder that keeps documents in a map and records what it was asked.
function fakeClient(options: { fail?: boolean; throws?: boolean } = {}) {
  const rows = new Map<string, unknown>()
  const calls: string[] = []
  const reply = <T,>(data: T) => {
    if (options.throws) throw new Error('offline')
    return Promise.resolve({ data, error: options.fail ? { message: 'denied' } : null })
  }
  const client: DocumentsClient = {
    from: (table) => ({
      select: (columns) => ({
        eq: (_a, projectId) => ({
          eq: (_b, kind) => ({
            maybeSingle: () => {
              calls.push(`select ${columns} from ${table} where ${projectId}/${kind}`)
              const key = `${projectId}/${kind}`
              return reply(rows.has(key) ? { value: rows.get(key) } : null)
            },
          }),
        }),
      }),
      upsert: (row, opts) => {
        calls.push(`upsert ${row.project_id}/${row.kind} on ${opts.onConflict}`)
        if (!options.fail && !options.throws) rows.set(`${row.project_id}/${row.kind}`, row.value)
        return reply(null)
      },
      delete: () => ({
        eq: (_a, projectId) => ({
          eq: (_b, kind) => {
            calls.push(`delete ${projectId}/${kind}`)
            rows.delete(`${projectId}/${kind}`)
            return reply(null)
          },
        }),
      }),
    }),
  }
  return { client, rows, calls }
}

describe('the Supabase document storage', () => {
  it('writes a document as the row for its project and kind, replacing the one that was there, and reads it back', async () => {
    const { client, calls } = fakeClient()
    const storage = createSupabaseDocumentStorage(client)
    expect(await storage.write('p1', 'board', { items: [1] })).toBe(true)
    expect(await storage.write('p1', 'board', { items: [1, 2] })).toBe(true)
    expect(await storage.read('p1', 'board')).toEqual({ items: [1, 2] })
    expect(calls).toContain('upsert p1/board on project_id,kind')
    expect(calls).toContain('select value from project_documents where p1/board')
  })

  it('reads null for a document that is not there', async () => {
    expect(await createSupabaseDocumentStorage(fakeClient().client).read('p1', 'memory')).toBeNull()
  })

  it('keeps projects and kinds apart', async () => {
    const storage = createSupabaseDocumentStorage(fakeClient().client)
    await storage.write('p1', 'memory', 1)
    await storage.write('p2', 'memory', 2)
    await storage.write('p1', 'chats', 3)
    expect([await storage.read('p1', 'memory'), await storage.read('p2', 'memory'), await storage.read('p1', 'chats')]).toEqual([1, 2, 3])
  })

  it('removes a document', async () => {
    const { client, rows } = fakeClient()
    const storage = createSupabaseDocumentStorage(client)
    await storage.write('p1', 'invoice', { a: 1 })
    await storage.remove('p1', 'invoice')
    expect(rows.size).toBe(0)
    expect(await storage.read('p1', 'invoice')).toBeNull()
  })

  it('says false for a write the database refused, and reads null for a read it refused, without throwing', async () => {
    const storage = createSupabaseDocumentStorage(fakeClient({ fail: true }).client)
    expect(await storage.write('p1', 'board', {})).toBe(false)
    expect(await storage.read('p1', 'board')).toBeNull()
  })

  it('does the same when the service cannot be reached at all', async () => {
    const storage = createSupabaseDocumentStorage(fakeClient({ throws: true }).client)
    expect(await storage.write('p1', 'board', {})).toBe(false)
    expect(await storage.read('p1', 'board')).toBeNull()
    await expect(storage.remove('p1', 'board')).resolves.toBeUndefined()
  })
})
