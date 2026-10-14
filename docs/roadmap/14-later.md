# 14 Later (after the presentations)

Short notes; each needs its own design pass before building.

- **Split view:** two workspaces side by side, each pane with its own header controls and Save, the chat on the right; below 64rem, one at a time with tabs. Droplet reads both panes. Open: change one workspace per reply (recommended) or both.
- **Composed views:** Droplet shows only the windows a task needs ("Arranged for checking contrast · Keep this layout · Back to my layout"), never overwriting the founder's layout. Open: once the founder moves a window in it, it becomes theirs (recommended).
- **Variants:** Try another makes a second palette (or set of notes) beside the first; Use this one keeps it.
- **Smarter Advanced:** read tools through function calling (`read_frame`, `read_chat`, `read_notes`, `read_invoice`), at most three reads before the turn; a self-check pass on turns with many actions.
- **Plans that run:** Do this step on a plan item runs one turn, shows the receipt and stops before the next.
- **Command menu:** Ctrl or Cmd with K, holding tasks, items from the library, chats and actions, plus "Ask Droplet".
- **Type pairing:** the brand workspace's fonts, from a bounded set of tested pairs.
- **Invoice actions:** `open_step`, `close_step`, layout actions, `new_invoice`, `copy_invoice`, `open_invoice`, a `review` block with Fix buttons.
- **Chat blocks:** `options` and `palette_options` (swatches that travel into the palette on Use this), `review`, `confirm`; Save to library on a block.
- **Prompt size:** trim the 8,000 to 9,000 token prompts; measure with the eval.
- **Measures:** log Undo this pressed straight after a turn, Try again and proposals turned down, as signs of a bad turn.
