# 09 Context from other workspaces

**Goal:** the composer can use what is in the workspaces that are not on screen, so "make a palette from the values on my board" and "use the offer from the board as the first line" work. Read only.

- Every request carries `<project_context>`: the digests from chunk 06 for workspaces not on screen. Until chunk 06 exists, a code-built summary: board frame titles with their notes' words, the saved palette with roles and contrast, open and saved invoices (number, client name, status).
- Capped at about 1,500 characters. No address, contact or bank detail (test, as for `invoiceSnapshot`).
- Prompt: what is in `<project_context>` can be read and used, not changed; to change another workspace, offer to switch to it (chunk 02).

**Tests:** context built for each workspace off screen; the cap; no private details. Eval: palette from board values; invoice line from the board's offer.
