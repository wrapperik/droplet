# Droplet roadmap: AI and experience

Build chunks from the AI and UX review of 6 October 2026. Each chunk is one reviewable piece of work. Read `CLAUDE.md` first; these files do not repeat it.

## Rules for every chunk

- Keep the product's rules: the AI only does what a person can do, through the same reducer; positions, sizes, colours, sums and contrast are worked out in code; nothing is remembered without the founder's say; addresses, contact and bank details are never sent to the model.
- Check every model reply in code (schema, then the rules), on the server and again in the browser.
- When a feature changes what Droplet can do, update `APP_KNOWLEDGE` in `src/compose/prompt.ts` and the relevant part of `CLAUDE.md`.
- Add fixed test requests to `src/compose/testRequests.ts` for new AI behaviour.
- Verify with `npx tsc -b`, `npx oxlint` and `npm test`. Do not test in a browser. Say plainly that visual and interactive behaviour has not been checked.

## Order

| # | Chunk | Depends on |
|---|---|---|
| 01 | [Base and Advanced modes](01-modes.md) | |
| 02 | [Open, switch and close in code](02-open-switch-close.md) | |
| 03 | [Change receipt and how changes arrive](03-change-receipt.md) | |
| 04 | [Memory: facts](04-memory-facts.md) | |
| 05 | [Memory: recall of past chats](05-memory-recall.md) | 04 |
| 06 | [Memory: workspace notes](06-workspace-notes.md) | 05 (shares the background call) |
| 07 | [Library](07-library.md) | 06 for the notes section |
| 08 | [Board actions](08-board-actions.md) | 03 |
| 09 | [Context from other workspaces](09-project-context.md) | 06 |
| 10 | [Inline AI and nudges](10-inline-ai-and-nudges.md) | 03, 08 |
| 11 | [Progress and calm replies](11-progress-and-reveal.md) | 01 |
| 12 | [Logo handoff](12-logo-handoff.md) | |
| 13 | [What Droplet used](13-what-i-used.md) | 04, 05, 06 |
| 14 | [Later](14-later.md) | |

Dates: UX300 submission Sunday 25 October, presentations 28 and 29 October. Aim to finish 01 to 13 before the submission; cut from the end if time runs short.

## Decisions (6 October)

| Question | Decision |
|---|---|
| Which model answers | Flash Lite always, unless the founder selects Advanced |
| Advanced | 3.8 Flash with Google Search, 10 requests a day per founder, for the next message only, never switched on by the app |
| Search provider | Google Search grounding (Tavily considered and left) |
| Token counts | Logged, never shown to founders |
| Notes Droplet writes from the founder's dictation | Pink |
| AI moving or tidying the founder's things | Allowed without asking, always in the receipt with Undo this |
| AI deleting or rewriting the founder's things | Only after a yes in the thread |
| Recall of past chats | On by default, with a switch |
| Workspace digest after a save | On by default, with a switch and a line on the Save note |
| Nudges | In the capstone build |
| Chats in the library | No, they stay in the sidebar |
| Forgetting from the library | Asks twice, as everywhere else |

Still open: in split view, one workspace changed per reply (recommended) or both; and whether a layout Droplet arranged becomes the founder's once they move a window in it (recommended: yes). Both are in chunk 14 and can wait.

## Findings behind this (short)

From the local log (`.droplet/compositions.jsonl`, 189 requests, 3 to 6 October):
- Lite answered 88% (the free 3.8 Flash quota is about 20 a day). Median wait: Lite 2.8 s, 3.8 Flash 7.9 s.
- 31 of 46 board turns changed nothing; several asks had no action ("make my board neat", "notes on the wrong frame", "clear the board").
- Opening a workspace costs two model calls (16 repeats in the log).
- A new chat forgets everything; founders asked "what do you know about me?" and "how did you know my location?".
- With the current free key, any request with Google Search on returns 429 ("check your plan and billing details") on both models, while the same request without search works. Search likely needs billing on the key. Check AI Studio's rate limit page.

Pitch Must-haves not built: logo handoff card, type pairing (fonts), review and export (covered by 07), dependencies and outstanding assets, `proposedMemory` (covered by 04).
