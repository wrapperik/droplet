-- Droplet: the project notebook.
--
-- Droplet keeps notes on each project so that a week after a brainstorm it still has the one good idea on the board: an index of what the workspaces hold,
-- word for word, and a short digest of each, written after a save. They are one more document per project, with the kind `notes`, held like the others in
-- project_documents, so the same row-level security keeps each founder to their own.
--
-- The founder can switch the notes off, read them, change the digests and delete them from the project brief.

alter table public.project_documents drop constraint if exists project_documents_kind_check;
alter table public.project_documents
  add constraint project_documents_kind_check check (kind in ('palette', 'board', 'invoice', 'memory', 'chats', 'notes'));
