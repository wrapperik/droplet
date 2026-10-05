-- Droplet: whether a request to the composer searched the web, for each founder's daily allowance of searches.
--
-- The composer may use Google Search when an answer needs current facts (a fee, a rule, how a tool works now). Each search is billed to the
-- project's key past a free monthly amount, so the `compose` function allows each founder a few a day (the secret COMPOSE_SEARCH_PER_DAY), counted
-- from this column over the last 24 hours. Only that it searched is kept: never what was searched for, what the founder asked, or what came back.
--
-- Run this before setting COMPOSE_SEARCH_PER_DAY. Until then the function does not search, and never writes this column.

alter table public.compositions add column if not exists searched boolean not null default false;

-- What the allowance counts: one founder's searched rows in the last day.
create index if not exists compositions_user_searched_idx on public.compositions (user_id, created_at desc) where searched;
