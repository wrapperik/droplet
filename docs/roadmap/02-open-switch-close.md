# 02 Open, switch and close in code

**Goal:** stop asking the model twice to open a workspace, and let the founder move between and close workspaces by asking.

- When the founder's message is exactly an `OPEN_PHRASE` (`src/compose/journey.ts`, sent by plan Open buttons and suggested replies), `Home.tsx` opens that workspace in code first, then asks the composer once with it on screen. No `opens` round trip.
- New actions in all three turn schemas: `switch_to { workspace }` (one that is already open: no `opens` check needed) and `close_workspace` (runs the existing `backToChat` leave check in the thread). Apply them in `Home.tsx` after the workspace's own actions.
- Prompt: say Droplet can switch between open workspaces and close them when asked ("lets go back", "close the workspace").
- Update stale comments in `Home.tsx` ("the AI does not touch it yet" for the invoice, "the composer does not see it" for the board) and the line in `CLAUDE.md` saying the composer does not see the board.

**Tests:** an `OPEN_PHRASE` makes one request, not two; `switch_to` shows the other workspace; `close_workspace` with unsaved work asks in the thread; eval requests for "lets go back" and "close the workspace".
