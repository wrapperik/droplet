// What a project may be called. Kept apart from the store so that it can be used without reaching for the database.

export const MAX_PROJECT_NAME = 80

// The name as it would be kept: on one line, tidied, and no longer than the database allows.
export const cleanProjectName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_PROJECT_NAME)

// The same name for the purpose of telling two projects apart: capitals and spaces do not make a different name.
export const nameKey = (name: string) => name.replace(/\s+/g, '').toLowerCase()

export type NameCheck = { ok: true; name: string } | { ok: false; error: string }

// Whether a name may be given to a project, and what it would be kept as. `existing` is the founder's projects; `exceptId` is the project
// being renamed, which may keep its own name (or change only its capitals).
export function checkProjectName(name: string, existing: { id: string; name: string }[], exceptId?: string): NameCheck {
  const clean = cleanProjectName(name)
  if (clean === '') return { ok: false, error: 'Give the project a name.' }
  if (name.replace(/\s+/g, ' ').trim().length > MAX_PROJECT_NAME) return { ok: false, error: `Use ${MAX_PROJECT_NAME} characters or fewer.` }
  const taken = existing.some((project) => project.id !== exceptId && nameKey(project.name) === nameKey(clean))
  if (taken) return { ok: false, error: 'You already have a project with that name.' }
  return { ok: true, name: clean }
}
