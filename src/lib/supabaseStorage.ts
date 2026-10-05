import type { DocKind, DocumentStorage } from './storage.ts'

// The document storage in Supabase: one row of `project_documents` per project and kind (see supabase/migrations). Row-level security
// keeps each founder to their own projects, so nothing here has to say whose a document is.

// The little of a Supabase client that this needs, so a test can stand in for it.
type Result<T> = PromiseLike<{ data: T; error: { message: string } | null }>
export type DocumentsClient = {
  from(table: 'project_documents'): {
    select(columns: 'value'): { eq(column: 'project_id', value: string): { eq(column: 'kind', value: string): { maybeSingle(): Result<{ value: unknown } | null> } } }
    upsert(row: { project_id: string; kind: string; value: unknown }, options: { onConflict: string }): Result<unknown>
    delete(): { eq(column: 'project_id', value: string): { eq(column: 'kind', value: string): Result<unknown> } }
  }
}

export function createSupabaseDocumentStorage(client: DocumentsClient): DocumentStorage {
  return {
    async read(projectId: string, kind: DocKind) {
      try {
        const { data, error } = await client.from('project_documents').select('value').eq('project_id', projectId).eq('kind', kind).maybeSingle()
        return error || !data ? null : data.value
      } catch {
        return null
      }
    },
    async write(projectId: string, kind: DocKind, value: unknown) {
      try {
        const { error } = await client.from('project_documents').upsert({ project_id: projectId, kind, value }, { onConflict: 'project_id,kind' })
        return !error
      } catch {
        return false
      }
    },
    async remove(projectId: string, kind: DocKind) {
      try {
        await client.from('project_documents').delete().eq('project_id', projectId).eq('kind', kind)
      } catch {
        // Nothing to remove.
      }
    },
  }
}
