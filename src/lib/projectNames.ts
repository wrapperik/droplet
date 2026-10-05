// What a project may be called. Kept apart from the store so that it can be used without reaching for the database.

export const MAX_PROJECT_NAME = 80

// The name as it would be kept: on one line, tidied, and no longer than the database allows.
export const cleanProjectName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_PROJECT_NAME)
