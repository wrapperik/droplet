import { mockProjects, type ProjectSummary } from './mockProjects.ts'
import { getSupabase } from './supabase.ts'

// A founder's projects. In Supabase they are rows of `projects`, and the database lists only the signed-in founder's. Without Supabase
// (this device alone) there are the three sample projects.

export const MAX_PROJECT_NAME = 80

// The founder is told that something could not be done, in the app's words. What the database said goes to the console, for whoever is
// building: a table that is missing because the migration was not run reads very differently from a policy that refused.
function failed(what: string, error: { message: string; code?: string }): null {
  console.error(`Droplet: could not ${what}. ${error.code ? `${error.code}: ` : ''}${error.message}`)
  return null
}

// The name as it would be kept: on one line, tidied, and no longer than the database allows.
export const cleanProjectName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_PROJECT_NAME)

// The projects of the signed-in founder, oldest first, or null if they could not be read.
export async function listProjects(): Promise<ProjectSummary[] | null> {
  const supabase = getSupabase()
  if (!supabase) return mockProjects
  const { data, error } = await supabase.from('projects').select('id, name').order('created_at', { ascending: true })
  if (error) return failed('read the projects', error)
  return data as ProjectSummary[]
}

// Makes a project for the signed-in founder. Null if the name is empty or it could not be made.
export async function createProject(name: string): Promise<ProjectSummary | null> {
  const clean = cleanProjectName(name)
  if (clean === '') return null
  const supabase = getSupabase()
  if (!supabase) return { id: `local-${Date.now().toString(36)}`, name: clean }
  const { data, error } = await supabase.from('projects').insert({ name: clean }).select('id, name').single()
  if (error) return failed('make the project', error)
  return data as ProjectSummary
}
