# 08 Board actions

**Goal:** the AI can arrange the board, not only add to it. Places and sizes are still worked out in code (`src/lib/boardPlacement.ts`), and every change is in the receipt (chunk 03).

| Action | Does | Rule |
|---|---|---|
| `move_to_frame { things, frame }` | Moves things into an existing frame's free space (`slotInFrame`) | Allowed without asking |
| `tidy { frame? }` | Lays out a frame's contents (or every frame's) in a grid and fits the frame (`layoutCluster`) | Allowed without asking |
| `arrange { layout: 'row' \| 'column' \| 'grid', frames }` | Places frames with even gaps | Allowed without asking |
| `remove { things }` | Deletes | Droplet's own notes freely; the founder's only after a confirm in the thread ("Delete 6 of your notes? Delete · Keep") |
| `edit_note { note, text }` | Changes words | Droplet's own notes freely; the founder's as a suggested edit shown on the note with Accept and Dismiss |
| `rename_frame { frame, title }` | Renames | Same rule as `edit_note` |
| `colour { things, colour }` | Recolours | Only when the founder's words ask for a colour (quote checked like `opens`); never pink; founder colours only |
| `summary_frame { decided, open, next }` | Writes the summary onto the board as a frame of pink notes | |
| `propose { key: 'name' \| 'offer', from }` | Opens the existing "Remember ... as the business name?" question | The founder presses Remember |

- `describeBoard` (`boardSnapshot.ts`) adds a coarse layout per frame (count, whether anything overlaps or sticks out) and the nearest frame for loose things. Still no coordinates.
- Interview mode in the prompt: when asked ("ask me questions to fill this in"), ask about one empty prompt at a time, fill it with the founder's answer (pink), select the next prompt, ask again.
- Update `BOARD_ACTING` in `prompt.ts` and the "can only add" lines in `CLAUDE.md`.

**Tests:** each action through `applyBoardTurnActions` and `checkBoardTurn`; founder's notes cannot be deleted or rewritten without the confirm; colour without a quote refused; no pink. Eval: "make my board neat", "these notes are in the wrong frame", "clear your notes", "make three blue notes", interview mode.
