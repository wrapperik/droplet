-- Droplet: the first schema.
--
-- Three tables, all owned by the signed-in founder and closed to everyone else by row-level security:
--   profiles           one row per founder: their display name.
--   projects           one per business; every document hangs off one.
--   project_documents  what a project saves, one JSON document per project and kind (palette, board, invoice arrangement, memory,
--                      chats). The app validates every document it reads, so the database only keeps it whole and keeps it private.
--
-- Run this once in the Supabase dashboard: SQL Editor, new query, paste, Run. It is safe to read first and it changes nothing outside
-- the public schema. The pitch's richer tables (compositions, assets, dependencies, exports) are added by later migrations.

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  -- Filled in from the signed-in user, so the app never has to say whose it is (and cannot say someone else's: see the policies).
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects (owner_id, created_at);

create table public.project_documents (
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('palette', 'board', 'invoice', 'memory', 'chats')),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (project_id, kind),
  -- A board of 500 things is well under this. It stops one document from being used as free storage.
  check (octet_length(value::text) <= 2000000)
);

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Housekeeping triggers
-- ---------------------------------------------------------------------------------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

create trigger project_documents_touch_updated_at
  before update on public.project_documents
  for each row execute function public.touch_updated_at();

-- A saved document is a change to its project, so the project's "last worked on" follows it.
create function public.touch_project_from_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.projects set updated_at = now() where id = new.project_id;
  return new;
end;
$$;

create trigger project_documents_touch_project
  after insert or update on public.project_documents
  for each row execute function public.touch_project_from_document();

-- Every new founder gets a profile, from the name they gave when they signed up (or the name Google gave), else the start of their email.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
        split_part(coalesce(new.email, ''), '@', 1)
      ),
      80
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- These three run inside the database, as triggers. Nobody should be able to call them from the API.
revoke execute on function public.touch_project_from_document() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Row-level security: a founder's rows are hers, and nobody else's. With it on and no policy, a table is closed to everyone.
-- ---------------------------------------------------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_documents enable row level security;

-- Profiles: read and change your own. Created only by the trigger above, and removed with the account.
create policy "profiles: read your own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "profiles: change your own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Projects: yours to list, make, rename and delete.
create policy "projects: read your own" on public.projects
  for select to authenticated using ((select auth.uid()) = owner_id);

create policy "projects: make your own" on public.projects
  for insert to authenticated with check ((select auth.uid()) = owner_id);

create policy "projects: change your own" on public.projects
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy "projects: delete your own" on public.projects
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- Documents: only those of a project that is yours.
create policy "documents: read your own" on public.project_documents
  for select to authenticated using (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

create policy "documents: save your own" on public.project_documents
  for insert to authenticated with check (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

create policy "documents: change your own" on public.project_documents
  for update to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

create policy "documents: delete your own" on public.project_documents
  for delete to authenticated using (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Access for the Data API. Written out, so this works whether or not new tables are exposed automatically, and so the anonymous role
-- (someone who is not signed in) is shut out on purpose rather than by accident.
-- ---------------------------------------------------------------------------------------------------------------------------------

revoke all on public.profiles, public.projects, public.project_documents from anon;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_documents to authenticated;
