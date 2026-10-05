import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockProjects } from './mockProjects.ts'

// The projects of a founder: from Supabase when it is set up, and the three sample projects when it is not.
afterEach(() => {
  vi.doUnmock('./supabase.ts')
  vi.resetModules()
})

describe('without Supabase', () => {
  it('lists the sample projects, and makes a project that lives on this device', async () => {
    const { listProjects, createProject } = await import('./projectsStore.ts')
    expect(await listProjects()).toBe(mockProjects)
    const made = await createProject('  Kindred   Gifting ')
    expect(made).toMatchObject({ name: 'Kindred Gifting' })
    expect(made?.id).toMatch(/^local-/)
  })

  it('makes no project with no name', async () => {
    const { createProject } = await import('./projectsStore.ts')
    expect(await createProject('   ')).toBeNull()
  })
})

describe('cleanProjectName', () => {
  it('puts a name on one line, tidied, and no longer than the database allows', async () => {
    const { cleanProjectName, MAX_PROJECT_NAME } = await import('./projectsStore.ts')
    expect(cleanProjectName('  A \n  name\t here ')).toBe('A name here')
    expect(cleanProjectName('x'.repeat(200))).toHaveLength(MAX_PROJECT_NAME)
  })
})

describe('with Supabase', () => {
  // A stand-in for the client's query builder, for what projectsStore asks of it.
  function mockClient(answers: { list?: { data: unknown; error: unknown }; insert?: { data: unknown; error: unknown } }) {
    const asked: string[] = []
    const client = {
      from: (table: string) => ({
        select: (columns: string) => {
          asked.push(`select ${columns} from ${table}`)
          return {
            order: async (column: string, options: { ascending: boolean }) => {
              asked.push(`order ${column} ${options.ascending ? 'asc' : 'desc'}`)
              return answers.list ?? { data: [], error: null }
            },
          }
        },
        insert: (row: unknown) => {
          asked.push(`insert ${JSON.stringify(row)}`)
          return { select: () => ({ single: async () => answers.insert ?? { data: null, error: null } }) }
        },
      }),
    }
    return { client, asked }
  }

  it('lists the founder\'s projects, oldest first, by what the database returns (which is only theirs)', async () => {
    const { client, asked } = mockClient({ list: { data: [{ id: 'u1', name: 'Kindred' }], error: null } })
    vi.doMock('./supabase.ts', () => ({ getSupabase: () => client }))
    const { listProjects } = await import('./projectsStore.ts')
    expect(await listProjects()).toEqual([{ id: 'u1', name: 'Kindred' }])
    expect(asked).toEqual(['select id, name from projects', 'order created_at asc'])
  })

  it('says null, not an empty list, when the projects could not be read, so a founder is not given a new first project over their own', async () => {
    const { client } = mockClient({ list: { data: null, error: { message: 'Could not find the table', code: 'PGRST205' } } })
    vi.doMock('./supabase.ts', () => ({ getSupabase: () => client }))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { listProjects } = await import('./projectsStore.ts')
    expect(await listProjects()).toBeNull()
    // what the database said goes to the console, for whoever is building, and not to the founder
    expect(logged).toHaveBeenCalledWith('Droplet: could not read the projects. PGRST205: Could not find the table')
    logged.mockRestore()
  })

  it('makes a project with a tidied name and no owner (the database fills in who is signed in), and gives back what was made', async () => {
    const { client, asked } = mockClient({ insert: { data: { id: 'u2', name: 'Pet sitting' }, error: null } })
    vi.doMock('./supabase.ts', () => ({ getSupabase: () => client }))
    const { createProject } = await import('./projectsStore.ts')
    expect(await createProject('  Pet   sitting ')).toEqual({ id: 'u2', name: 'Pet sitting' })
    expect(asked).toEqual(['insert {"name":"Pet sitting"}'])
  })

  it('says null when it could not be made', async () => {
    const { client } = mockClient({ insert: { data: null, error: { message: 'denied' } } })
    vi.doMock('./supabase.ts', () => ({ getSupabase: () => client }))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { createProject } = await import('./projectsStore.ts')
    expect(await createProject('Pet sitting')).toBeNull()
    expect(logged).toHaveBeenCalledWith('Droplet: could not make the project. denied')
    logged.mockRestore()
  })
})
