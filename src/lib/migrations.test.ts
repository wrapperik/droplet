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

  it('make the tables the app uses', () => {
    expect([...tables].sort()).toEqual(['compositions', 'profiles', 'project_documents', 'projects'])
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
    for (const table of tables) expect(code, table).toMatch(new RegExp(`revoke all on [^;]*public\\.${table}\\b[^;]* from anon`))
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
    // and the notebook is one more kind, which replaces that check (the app and the database agree on the kinds)
    expect(code).toMatch(/drop constraint if exists project_documents_kind_check/)
    expect(code).toMatch(/add constraint project_documents_kind_check check \(kind in \('palette', 'board', 'invoice', 'memory', 'chats', 'notes'\)\)/)
    expect(code).toMatch(/octet_length\(value::text\) <= 2000000/)
  })

  it('keep the record of the composer free of what the founder wrote, and writable only by the function', () => {
    const compositions = /create table public\.compositions \(([\s\S]*?)\n\);/.exec(code)?.[1] ?? ''
    // the names of the columns (the first word of each line that makes one), not their types
    const columns = compositions.split('\n').map((line) => /^\s{2}(\w+) /.exec(line)?.[1]).filter(Boolean)
    expect(columns).toEqual(['id', 'user_id', 'outcome', 'task', 'model', 'error', 'actions', 'bad_replies', 'ms', 'created_at'])
    expect(columns.filter((name) => /intent|spec|message|prompt|text|body|content|reply/.test(name ?? ''))).toEqual([])
    // the founder may read their own rows, and nothing more: the function writes with its own key (service_role), which may read to count and
    // insert to log, and nothing more
    expect(code).toMatch(/grant select on public\.compositions to authenticated/)
    expect(code).toMatch(/grant select, insert on public\.compositions to service_role;/)
    expect(code).not.toMatch(/grant [^;]*\b(insert|update|delete)\b[^;]* on public\.compositions to (?!service_role;)/)
    expect(code).not.toMatch(/grant [^;]*\b(update|delete)\b[^;]* on public\.compositions/)
    expect(code).not.toMatch(/create policy "[^"]+" on public\.compositions\s+for (insert|update|delete)/)
  })

  it('add to the record only whether a request searched, which mode asked and answered, and how many tokens it used: never what was asked, answered or searched for', () => {
    const added = [...code.matchAll(/alter table public\.compositions add column (?:if not exists )?(\w+) ([^;]+);/g)].map((match) => [match[1], match[2].trim()])
    expect(added).toEqual([
      ['searched', 'boolean not null default false'],
      ['search_refused', 'boolean not null default false'],
      ['mode', "text check (mode in ('base', 'advanced'))"],
      ['answered_by', "text check (answered_by in ('base', 'advanced'))"],
      ['prompt_tokens', 'integer check (prompt_tokens >= 0)'],
      ['answer_tokens', 'integer check (answer_tokens >= 0)'],
      ['thinking_tokens', 'integer check (thinking_tokens >= 0)'],
    ])
    expect(code).toMatch(/create index if not exists compositions_user_searched_idx on public\.compositions \(user_id, created_at desc\) where searched/)
    // what the daily allowance counts: a founder's Advanced answers, oldest first
    expect(code).toMatch(/create index if not exists compositions_user_advanced_idx on public\.compositions \(user_id, created_at asc\) where answered_by = 'advanced'/)
  })

  it('count a founder\'s recent requests from an index made for it', () => {
    expect(code).toMatch(/create index compositions_user_recent_idx on public\.compositions \(user_id, created_at desc\)/)
  })
})
