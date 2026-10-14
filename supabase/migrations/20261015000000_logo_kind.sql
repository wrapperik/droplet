-- Droplet: the logo.
--
-- Droplet does not make logos. A founder makes theirs in a free tool and brings the file back (a PNG or an SVG of at most 1 MB), which Droplet keeps
-- for the project so the library can show it as made. It is one more document per project, with the kind `logo`, held like the others in
-- project_documents: the same row-level security keeps each founder to their own, and the cascade from the account deletes it with the rest.

alter table public.project_documents drop constraint if exists project_documents_kind_check;
alter table public.project_documents
  add constraint project_documents_kind_check check (kind in ('palette', 'board', 'invoice', 'memory', 'chats', 'notes', 'logo'));
