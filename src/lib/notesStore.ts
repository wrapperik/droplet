import { emptyNotes, notesSchema, type NotesDoc } from './notes.ts'
import { documentStorage } from './storage.ts'

// The project's notebook, through the document storage. Every call is asynchronous. A notebook that cannot be read is an empty one, and is built again
// on the next save: it holds nothing that is not kept somewhere else.
export async function loadNotes(projectId: string): Promise<NotesDoc> {
  const parsed = notesSchema.safeParse(await documentStorage().read(projectId, 'notes'))
  return parsed.success ? parsed.data : emptyNotes()
}

// False when it could not be stored. Writing notes does not tell the listeners that a document was saved: the notebook is not something to be noted.
export function saveNotes(projectId: string, notes: NotesDoc): Promise<boolean> {
  return documentStorage().write(projectId, 'notes', notes)
}

export function clearNotes(projectId: string): Promise<void> {
  return documentStorage().remove(projectId, 'notes')
}
