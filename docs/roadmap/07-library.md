# 07 Library

**Goal:** one screen per project listing everything the founder has made, where it stands and what they can do with it. It is also the pitch's Review and export screen and the project home.

## Where
- A **Library** row in the sidebar under New chat (Solar icon), an icon when collapsed.
- Shown in the working screen as a fourth view (`WorkspaceView` in `shownWorkspace.ts`), with the chat docked beside it. Opening an item's workspace replaces it; Back returns.

## Sections, in journey order
| Section | Shows | Actions |
|---|---|---|
| Business | Decided name (large), offer, when remembered; facts from chunk 04 | Change (opens the board), Forget (asks twice) |
| Brand | Palette swatches with roles, text-on-background contrast and pass or fail, date saved | Open, Export brand sheet, Copy hex codes |
| Logo | Outstanding, "Made outside Droplet", the brief if one exists | Make the brief (asks Droplet) |
| Ideas | Small picture of the board from `drawBoard` (`boardDrawing.ts`), counts of notes and frames, date saved | Open, Export PNG, Export PDF |
| Invoices | Number, client, total (`computeTotals`, not stored), date, status: not exported, exported on a date, changed since export | Open, Copy, Export PDF, Forget (asks twice) |
| Clients | Name, whether the address is filled in | New invoice for this client, Forget (asks twice) |
| Business details | Name, and whether address, contact, VAT and bank details are filled in (not the details) | Edit (opens the invoice's Your business step) |
| Droplet's notes | The notebook from chunk 06 | Edit, Rebuild, Delete |

- Statuses use `StatusMark` (word and icon); not started is the grey pending mark, never orange.
- Outstanding never blocks: every finished item can be exported.
- Empty sections say what makes them and offer to open the workspace.
- Chats are not listed (they stay in the sidebar).

## Build
- No new storage. A pure, tested `libraryOf({ palette, board, memory, notes })` returns items with kind, title, status, date and actions.
- `Library.tsx` draws them; actions reuse `openSavedInvoice`, `duplicateInvoice`, `exportBrandSheet`, the board export, `forgetClient`, `forgetInvoice` and the existing confirm notes.
- Add `exportedAt` to the palette and board saves when they are exported.
- Reread after any save.

## AI
- The composer is told what the library holds (counts, names, statuses; no private details).
- New actions: `open_item { kind, which }` ("the last invoice", "INV-0007") and `export_item`.

**Tests:** `libraryOf` for an empty project, a full one, an invoice changed since export and a palette that fails contrast; forget asks twice; `exportedAt` recorded.
