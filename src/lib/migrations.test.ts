import { describe, expect, it } from 'vitest'
// The migrations are read as text from the project folder (the tests run from it). The app's config has no Node types, so the one line that
// needs them says so.
// @ts-expect-error node:fs has no types in the app's config
const fs = (await import('node:fs')) as { readdirSync: (path: string) => string[]; readFileSync: (path: string, encoding: string) => string }
const files = fs.readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort()
const sql = files.map((name) => fs.readFileSync(`supabase/migrations/${name}`, 'utf8')).join('\n')
// Without the comments, so a word in one is not taken for code.
const code = sql.replace(/--.*$/gm, '')

const tables = [...code.matchAll(/create table public\.(\w+)/g)].map((match) => match[1])

// What keeps a founder's data hers is in these files, and nowhere else. These read them for the mistakes that would be silent: a table with
// no row-level security, a table the signed-out can read, a function anyone can call.
describe('the database migrations', () => {
  it('are there, in the order they were made', () => {
    expect(files.length).toBeGreaterThan(0)
    expect(files).toEqual([...files].sort())
  })

  it('make the three tables the app uses', () => {
    expect(tables.sort()).toEqual(['profiles', 'project_documents', 'projects'])
  })

  it('turn row-level security on for every table, so a table with no policy is closed to everyone', () => {
    for (const table of tables) expect(code, table).toMatch(new RegExp(`alter table public\\.${table} enable row level security`))
  })

  it('give every table a policy to read it, and none of them to the signed-out (anon) role', () => {
    for (const table of tables) expect(code, table).toMatch(new RegExp(`create policy "[^"]+" on public\\.${table}\\s+for select to authenticated`))
    expect(code).not.toMatch(/create policy[^;]*\bto anon\b/)
    expect(code).not.toMatch(/create policy[^;]*\bto public\b/)
  })

  it('give every policy that changes data the check that it is the founder\'s own', () => {
    const policies = [...code.matchAll(/create policy "([^"]+)" on public\.(\w+)([\s\S]*?);/g)]
    expect(policies.length).toBeGreaterThanOrEqual(10)
    for (const [, name, , body] of policies) expect(body, name).toMatch(/auth\.uid\(\)/)
  })

  it('close every table to the signed-out role, and open only what the signed-in need', () => {
    expect(code).toMatch(/revoke all on public\.profiles, public\.projects, public\.project_documents from anon/)
    expect(code).not.toMatch(/grant [^;]* to anon/)
    // a founder cannot make or remove a profile: that is done by the trigger and by deleting the account
    expect(code).toMatch(/grant select, update on public\.profiles to authenticated/)
  })

  it('keep every function that runs as a trigger out of reach of the API', () => {
    const triggers = [...code.matchAll(/create function public\.(\w+)\(\)/g)].map((match) => match[1])
    expect(triggers.length).toBeGreaterThan(0)
    for (const name of triggers) expect(code, name).toMatch(new RegExp(`revoke execute on function public\\.${name}\\(\\) from public, anon, authenticated`))
  })

  it('give every function that runs with its owner\'s rights a fixed search path', () => {
    const functions = [...code.matchAll(/create function[\s\S]*?\$\$;/g)].map((match) => match[0])
    expect(functions.length).toBeGreaterThan(0)
    for (const body of functions.filter((text) => /security definer/.test(text))) expect(body).toMatch(/set search_path = ''/)
  })

  it('delete a founder\'s projects and their documents when the account or project goes', () => {
    expect(code).toMatch(/owner_id uuid not null default auth\.uid\(\) references auth\.users \(id\) on delete cascade/)
    expect(code).toMatch(/project_id uuid not null references public\.projects \(id\) on delete cascade/)
    expect(code).toMatch(/id uuid primary key references auth\.users \(id\) on delete cascade/)
  })

  it('only allow the kinds of document the app saves, and hold a document to a size', () => {
    expect(code).toMatch(/kind in \('palette', 'board', 'invoice', 'memory', 'chats'\)/)
    expect(code).toMatch(/octet_length\(value::text\) <= 2000000/)
  })
})
