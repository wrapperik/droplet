-- Droplet: the record of how the composer did, and the count behind the per-founder limit.
--
-- One row per request to the `compose` Edge Function: who asked, which task it came to, how it went (valid, retried, fell back or failed),
-- which model answered and how long it took. It is the honest log of how often the model gave a valid answer (manifesto principle 5) and what the
-- function counts to hold each founder to an hour's worth of requests.
--
-- It does NOT keep what the founder asked or what the model answered. The pitch's table has the spec and the intent text; those are left out on
-- purpose, since the research found that people will not hand an AI their client or financial details, and the log does not need them.
--
-- Rows are written by the function, with its own service key, so there is no policy to insert. A founder may read their own rows.

create table public.compositions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  outcome text not null check (outcome in ('valid', 'retried', 'fallback', 'error')),
  task text check (char_length(task) <= 40),
  model text check (char_length(model) <= 80),
  -- The kind of failure for an outcome of error (such as quota or rate_limited), never the model's own words.
  error text check (char_length(error) <= 40),
  actions integer check (actions >= 0),
  bad_replies integer check (bad_replies >= 0),
  ms integer check (ms >= 0),
  created_at timestamptz not null default now()
);

-- What the limit counts: one founder's rows in the last hour.
create index compositions_user_recent_idx on public.compositions (user_id, created_at desc);

alter table public.compositions enable row level security;

create policy "compositions: read your own" on public.compositions
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.compositions from anon;
revoke all on public.compositions from authenticated;
grant select on public.compositions to authenticated;
