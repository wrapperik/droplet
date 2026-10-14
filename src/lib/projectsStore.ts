import { z } from 'zod'
import { mockProjects, type ProjectSummary } from './mockProjects.ts'
import { cleanProjectName } from './projectNames.ts'
import { getSupabase } from './supabase.ts'

export { cleanProjectName, MAX_PROJECT_NAME } from './projectNames.ts'

// A founder's projects. In Supabase they are rows of `projects`, and the database lists only the signed-in founder's. Without Supabase
// (this device alone) there are the three sample projects, plus any the founder made here, and any new names they gave, kept in this browser.

export const LOCAL_PROJECTS_KEY = 'droplet-local-projects'

const localListSchema = z.object({
  created: z.array(z.object({ id: z.string().min(1), name: z.string().min(1).max(80) })).max(100),
  renamed: z.record(z.string(), z.string().min(1).max(80)),
})
type LocalList = z.infer<typeof localListSchema>

function readLocal(): LocalList {
  try {
    const raw = window.localStorage.getItem(LOCAL_PROJECTS_KEY)
    const parsed = raw ? localListSchema.safeParse(JSON.parse(raw)) : null
    if (parsed?.success) return parsed.data
  } catch {
    // storage blocked or not JSON: the sample projects, as if nothing had been changed
  }
  return { created: [], renamed: {} }
}

// Whether it could be kept.
function writeLocal(list: LocalList): boolean {
  try {
    window.localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

function localProjects(): ProjectSummary[] {
  const { created, renamed } = readLocal()
  return [...mockProjects, ...created].map((project) => (renamed[project.id] ? { ...project, name: renamed[project.id] } : project))
}

// The founder is told that something could not be done, in the app's words. What the database said goes to the console, for whoever is
// building: a table that is missing because the migration was not run reads very differently from a policy that refused.
function failed(what: string, error: { message: string; code?: string }): null {
  console.error(`Droplet: could not ${what}. ${error.code ? `${error.code}: ` : ''}${error.message}`)
  return null
}

// The projects of the signed-in founder, oldest first, or null if they could not be read.
export async function listProjects(): Promise<ProjectSummary[] | null> {
  const supabase = getSupabase()
  if (!supabase) return localProjects()
  const { data, error } = await supabase.from('projects').select('id, name').order('created_at', { ascending: true })
  if (error) return failed('read the projects', error)
  return data as ProjectSummary[]
}

// Makes a project for the signed-in founder. Null if the name is empty or it could not be made.
export async function createProject(name: string): Promise<ProjectSummary | null> {
  const clean = cleanProjectName(name)
  if (clean === '') return null
  const supabase = getSupabase()
  if (!supabase) {
    const made = { id: `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: clean }
    const list = readLocal()
    return writeLocal({ ...list, created: [...list.created, made] }) ? made : null
  }
  const { data, error } = await supabase.from('projects').insert({ name: clean }).select('id, name').single()
  if (error) return failed('make the project', error)
  return data as ProjectSummary
}

// Gives a project a new name. Null if the name is empty or it could not be changed. The database lets a founder change only their own.
export async function renameProject(id: string, name: string): Promise<ProjectSummary | null> {
  const clean = cleanProjectName(name)
  if (clean === '') return null
  const supabase = getSupabase()
  if (!supabase) {
    if (!localProjects().some((project) => project.id === id)) return null
    // A project made here is renamed where it is kept; a sample project gets a new name beside the sample.
    const list = readLocal()
    const made = list.created.some((project) => project.id === id)
    const created = list.created.map((project) => (project.id === id ? { ...project, name: clean } : project))
    return writeLocal({ created, renamed: made ? list.renamed : { ...list.renamed, [id]: clean } }) ? { id, name: clean } : null
  }
  const { data, error } = await supabase.from('projects').update({ name: clean }).eq('id', id).select('id, name').single()
  if (error) return failed('rename the project', error)
  return data as ProjectSummary
}
