# 06 Memory: workspace notes (the project notebook)

**Goal:** a week after a brainstorm, Droplet still has the one good idea on the board. A notebook per project, updated on save, indexed so Droplet can reach the right part.

## Two parts
- **Index** (code, on every save or confirm): every thing word for word. Board: each note, shape and text with its frame, author and date added or changed. Palette: each colour with hex, role, name. Invoices: number, client name, lines, total, status. No model call.
- **Digest** (Base, in the background after a save): per workspace, about 800 characters: what it is about, decided, open, and up to five standout ideas. For a standout idea the model returns only the reference (`n14`) and a one-line reason; code copies the note's exact words in. References not on the board are dropped.

## Stars
A star toggle ("Keep in mind", Solar star icon) on the board's selection bar, on a palette colour and on an invoice line. Starred things are always in the digest. Add `starred?: boolean` to the board item, palette block and line save schemas (optional, so old saves still read).

## When
- Index: on every save, instantly.
- Digest: after a save, without holding it up; only if the content changed since the last digest; at most once every 5 minutes per workspace; Base only, never counted against Advanced. On failure, mark the digest out of date and retry on the next save.
- On by default. The Save note says "Droplet will update its notes on this project". Switch in the project brief: "Keep notes on my workspaces".

## Use
- Each request carries the digests of workspaces not on screen as `<project_notes>` (about 2,500 characters).
- If the request has words the digests do not cover, code searches the index and adds matching lines (about 1,000 characters, with workspace and date) as `<from_your_notes>`.
- A digest may suggest a fact ("You starred the care plan. Remember it as your offer?") through chunk 04's `propose`. A note is an idea, not a decision.

## Storage and privacy
- New document kind `notes` (`src/lib/storage.ts` `DocKind`, a migration adding it to the `project_documents.kind` check, `migrations.test.ts`), Zod-validated, capped (about 200 KB), structured per workspace and printed as text when sent or shown.
- Invoice parts come from the sanitised `invoiceSnapshot` data: no address, contact or bank detail (test).
- Shown in the library (chunk 07) as "Droplet's notes on this project" with Edit (digest), Rebuild and Delete per workspace.

**Tests:** index from each workspace; digest keeps the starred note; reference check drops unknown refs and copies exact words; throttle and change detection; search returns matching lines within the cap; no private details; old saves without `starred` still read.
