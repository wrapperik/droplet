-- Droplet: Quick and Advanced. Which mode a request asked for and which answered, and the tokens it used.
--
-- Every message is answered by the Quick model unless the founder chooses Advanced for it, which uses a stronger model with Google Search and has a
-- small allowance per founder per day (the secret COMPOSE_ADVANCED_PER_DAY, 10 unless set). The `compose` function counts a founder's Advanced answers
-- from this table over the last 24 hours. An Advanced request that Quick answered because Google's model was busy or out of quota is recorded with
-- answered_by = 'base', so it does not count against the founder.
--
-- The token counts are for working out what the composer costs. They are never shown to founders. As before, nothing the founder wrote or the
-- model answered is kept.
--
-- Run this after the earlier compositions migrations and before deploying the function that uses it.

alter table public.compositions add column if not exists search_refused boolean not null default false;
alter table public.compositions add column if not exists mode text check (mode in ('base', 'advanced'));
alter table public.compositions add column if not exists answered_by text check (answered_by in ('base', 'advanced'));
alter table public.compositions add column if not exists prompt_tokens integer check (prompt_tokens >= 0);
alter table public.compositions add column if not exists answer_tokens integer check (answer_tokens >= 0);
alter table public.compositions add column if not exists thinking_tokens integer check (thinking_tokens >= 0);

-- What the allowance counts: one founder's Advanced answers in the last day.
create index if not exists compositions_user_advanced_idx on public.compositions (user_id, created_at asc) where answered_by = 'advanced';
