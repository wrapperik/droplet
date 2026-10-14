# Research Findings deck: what is actually built

Checked against the code, the git history and the pitch folder on 13 October 2026, at commit `25dc2ee`. No code was changed and the app was not run. Two limits: the deployed Supabase `compositions` table could not be read, and the phone layout has only been read from the CSS, not tried on a phone.

## Status at a glance

| # | Question | Status |
|---|---|---|
| 1 | Details entered once, client records | **Built** |
| 2 | Stable invoice numbers | **Built** |
| 3 | Brand applied to a new invoice | **Partly built** (palette yes, type and logo no) |
| 4 | Nothing saved before Confirm | **Partly built** |
| 5 | Direct editing and undo | **Built** (with gaps) |
| 6 | Clarifying questions | **Built** (driven by the prompt, one rule enforced in code) |
| 7 | One-line `reason` on screen | **Partly built** |
| 8 | Retry, fallback, "simpler" note | **Built, changed** |
| 9 | Equal ways in on a start screen | **Not built as pitched** |
| 10 | Task menu one click away | **Built** (two clicks to a task) |
| 11 | Logo handoff | **Not built yet** |
| 12 | What is sent to Gemini | **Built**, but client names and amounts are sent |
| 13 | Where client data lives | **Built** (Supabase, RLS, no Storage) |
| 14 | Delete account and data | **Not built yet** |
| 15 | Invoice PDF / phone | PDF **Built**, phone **Partly built, not tested** |
| 16 | Outcome logging | **Built**, real data is development testing only |

---

## Memory and invoices

### 1. Are business and client details entered once and reused? Built.

Business details and a separate client record are both kept per project ([projectMemory.ts](../src/lib/projectMemory.ts), [memorySave.ts](../src/lib/memorySave.ts)).

- A client record is `{ id, client, confirmedAt }`, with name, contact, address, email, VAT number and reference ([invoice.ts:34](../src/lib/invoice.ts#L34)).
- Clients are matched by name, ignoring case: "A client with the name of one already remembered replaces it, so the same client is never remembered twice." ([projectMemory.ts:37](../src/lib/projectMemory.ts#L37))
- A new invoice starts with the business filled in: "A new invoice: dated today, with the next number, and the founder's business already on it, so it is never typed twice." ([projectMemory.ts:178](../src/lib/projectMemory.ts#L178))
- Clients are reused through the client window (Use / Forget), the AI's `use_saved_client` action and the library's "New invoice for this client".
- **Caveat:** clients are reused across invoices, not across tasks, because client email is not built. The business name is the one thing shared across tasks: from the board to the invoice, via `withIdea`.

### 2. How are invoice numbers generated, and do they stay the same? Built.

- `nextInvoiceNumber` ([projectMemory.ts:164](../src/lib/projectMemory.ts#L164)) carries on from the highest number in the founder's own style ("2026/12" to "2026/13") and never reuses one.
- Editing keeps the number: "An invoice confirmed again is a revision of the same invoice: it keeps its place, its id and its number is whatever it says." ([projectMemory.ts:44](../src/lib/projectMemory.ts#L44)) Only the `revision` count goes up.
- Re-exporting: `markExported` and `isRevisedSinceExport` show "changed since it was exported".
- The AI cannot change the number, and a number another invoice already has blocks export.
- Tested in [projectMemory.test.ts](../src/lib/projectMemory.test.ts) (lines 79, 89, 121 to 135).
- The founder can still edit the number by hand.

### 3. Is the confirmed brand applied to a new invoice? Partly built.

- **Palette: yes.** It loads the saved palette, or the starter palette until there is one ([useInvoiceMemory.ts:25](../src/components/invoice/useInvoiceMemory.ts#L25)).
- **Business name and details: yes.**
- **Type: no.** No type pairing exists anywhere. The prompt says so itself: "It has colours only: fonts are not in it yet" ([prompt.ts:63](../src/compose/prompt.ts#L63)). The invoice uses Google Sans on screen and Helvetica in the PDF, whatever the brand.
- **Logo: no slot on the invoice.**
- **Worth fixing before presenting:** the task menu still says "Palette and type, checked for contrast" ([tasks.ts](../src/lib/tasks.ts)).

## Control and trust

### 4. Is anything saved before the user confirms? Partly built.

- **Invoice:** Save opens a note of exactly what will be kept, and only the confirm button saves: "Pressing Save does not save: it opens a note of exactly what would be remembered, each item with a tick, and only the confirm button saves. Leaving the note, or pressing Escape or Cancel, saves nothing." ([ConfirmSave.tsx:30](../src/components/invoice/ConfirmSave.tsx#L30)) On screen: "Droplet will remember what you tick. Nothing else is kept."
- **Business name and offer:** a "Remember …?" question with a Remember button.
- **Facts:** Remember / Not now chips, then a toast with Undo. The AI can only `propose`, never save.
- **Palette and board:** a plain Save button with no confirm note, but nothing is saved before it is pressed.
- **Kept automatically, with no confirm:**
  - Chat history.
  - The AI's summaries of past chats, written when the founder leaves a chat ([Home.tsx:874](../src/pages/Home.tsx#L874)).
  - The notebook digests, written after a Save.
  - Both of the last two are **on by default**. They can be switched off, edited and deleted in the Project brief.
- The pitch's `proposedMemory` field is not used. Facts proposed through `propose` replaced it.

### 5. Can everything be edited directly, and is there undo? Built, with gaps.

- Palette, invoice and board are all edited directly. Droplet's pink board notes have "Keep as mine". Facts and chat memories can be edited in the brief.
- Undo and redo are in the header and on Ctrl or Cmd with Z ([history.ts](../src/lib/history.ts)).
- Each AI reply is one history step. The change receipt offers **Undo this** ([ChangeReceipt.tsx](../src/components/ChangeReceipt.tsx)), which refuses if the founder has changed things since, and points to the header Undo instead.
- Facts keep their last five values.
- **Gaps:**
  - Palette layout moves have Reset layout, not undo.
  - A saved invoice keeps no earlier versions, only a count.
  - Forget is final after the second press.
  - Tables in the chat cannot be edited.

### 6. Does Droplet ask a clarifying question instead of composing? Built, mostly through the prompt.

- Rule: "When the request leaves out something you cannot sensibly assume (a business you know nothing about, an invoice with no client and no items), do not guess: change nothing, say in one line what you need, and ask for it." ([prompt.ts:192](../src/compose/prompt.ts#L192))
- Other moments it asks:
  - A new business: one question per turn ([prompt.ts:83](../src/compose/prompt.ts#L83)).
  - Before proposing a plan ([prompt.ts:86](../src/compose/prompt.ts#L86)).
  - An invoice asked for before the brand exists ([prompt.ts:101](../src/compose/prompt.ts#L101)).
  - An unclear "let's go back" ([prompt.ts:115](../src/compose/prompt.ts#L115)).
- **Enforced in code:** a workspace opens only if the reply quotes the founder's own words asking for it (`checkOpening` in [rules.ts](../src/compose/rules.ts)).
- The fallback also asks rather than guesses.
- Whether it actually asks is model behaviour, measured by the eval (for example `palette-vague`), not guaranteed.

### 7. Does each component show its one-line reason? Partly built.

- An info button ("Why is this here?") sits beside each window title ([Toolbar.tsx:28](../src/components/Toolbar.tsx#L28)). Tools show their reason as a tooltip, and the board has a corner label.
- It shows on hover or focus only, not as visible text.
- Most reasons are fixed copy, for example "Shows the palette on a real document, because swatches alone do not show how it will work." ([PaletteWorkspace.tsx:171](../src/components/PaletteWorkspace.tsx#L171))
- The model writes one only through `set_palette.reason` and `show_component.reason`.
- The guided invoice has a lead line per step, not this button.

### 8. What happens on a validation failure? Built, but the fallback changed.

- [compose.ts](../src/compose/compose.ts) checks the schema, then the rules in code. It retries once with the reasons, and falls back on a second failure (line 158). The browser checks the reply again.
- The fallback no longer opens a fixed layout. With a workspace open it changes nothing; with none open it asks again ([fallback.ts](../src/compose/fallback.ts)). This was changed in commit `d5b1eea`.
- The note says: "A simpler answer was used because I could not work out your request."

## Familiar path

### 9. Are the intent field and the task menu equal on the start screen? Not built as pitched.

- There is no project start screen. Home is a chat.
- The text field is the full-width bar ("Write your message...").
- The task menu sits behind a small **+** ("Choose a task") and a tip, "Show me a menu of available workspaces". The tip shows only before anything is said ([Home.tsx:1243](../src/pages/Home.tsx#L1243)).
- The two are not equal in size or weight, and the sidebar's task list was removed in `e0a8261`.
- This misses user story 1's acceptance check. Worth saying openly in the deck.

### 10. Is the task menu one click away in every workspace? Built: two clicks.

- Every workspace has the docked message bar with the **+**. One click opens the menu, a second opens the task.
- Brand, invoice and the board open without the model ([Home.tsx:690](../src/pages/Home.tsx#L690)).
- **"Get a logo" and "Write to a client" do nothing on screen.** The code comment says "Tasks without a workspace say so", but there is no branch for them.

## Handoff

### 11. What does the logo handoff include? Not built yet.

The roadmap item [12-logo-handoff.md](roadmap/12-logo-handoff.md) is still a plan.

What exists:

- The prompt says Droplet cannot make logos, points to Canva or Adobe Express and helps write a brief ([prompt.ts:104](../src/compose/prompt.ts#L104)).
- The library has a Logo row, always "outstanding" and "Made outside Droplet". Its "Make the brief" button sends "Help me write a short brief for my logo." ([library.ts:184](../src/lib/library.ts#L184), [Library.tsx:329](../src/components/Library.tsx#L329))

What does not exist:

- A handoff card or spec panel.
- Formats or light, dark and transparent variants.
- A link-out or an import slot.
- A logo placeholder on the invoice, or any flag on it.

Only the AI, when asked in the chat for an invoice, pushes once for the logo first. Nothing blocks.

## Data

### 12. Exactly what is sent to Gemini? Mostly as pitched, but client names and amounts are sent.

Every request carries:

- The message (up to 600 characters) and the conversation so far.
- The project snapshot: business name, offer, counts, and the confirmed facts, filtered for private details.
- The library snapshot: invoice numbers, **client names**, statuses.
- Optional memories of earlier chats and notes digests ([spec.ts:192](../src/compose/spec.ts#L192)).

Per workspace:

- **Invoice** ([invoiceSnapshot.ts](../src/compose/invoiceSnapshot.ts)):
  - Number, dates, terms, the invoice note and the VAT setting.
  - Business name, plus only yes or no for its address, contact and bank details.
  - **Client name**, plus yes or no for the address.
  - **The saved client names.**
  - **Line items with quantity and unit price**, and totals worked out in code.
- **Palette:** colours, roles, contrast figures and the layout.
- **Board:** the notes' words.

Background requests also go to the model:

- A chat's text, to summarise it.
- The notes index, which holds **invoice totals and line prices** ([notes.ts:110](../src/lib/notes.ts#L110)).

What is never sent:

- Addresses, emails, phone numbers, bank details and VAT numbers from the form fields. Tested at [invoiceCompose.test.ts:79](../src/compose/invoiceCompose.test.ts#L79).
- **But** the message and board notes are not filtered. Whatever the founder types goes as written. `containsPrivateDetail` only checks facts and background output.

Worth checking: what Google's terms for the unpaid Gemini tier allow it to do with that content.

### 13. Where is client data stored? Built.

- Client data sits in `project_documents`: one jsonb row per project and kind, with clients inside the `memory` row ([init.sql](../supabase/migrations/20261005000000_init.sql)).
- RLS is on every table, checked against `auth.uid()`, with the signed-out role revoked and `on delete cascade` from `auth.users`.
- **No Storage bucket exists.**
- On the device only:
  - The theme and Guide or Workspace preference, in localStorage.
  - Everything, when the app runs without Supabase.
  - The development log, which **does store the message text** ([compositionLog.ts:8](../server/compositionLog.ts#L8)). The deployed function does not.
- The pitched `memory_entries` and `assets` tables were not built.

### 14. Is "Delete account and data" implemented? Not built yet.

- [Account.tsx](../src/pages/Account.tsx) has no button for it. It is listed in [14-later.md](roadmap/14-later.md).
- The schema is ready: deleting the auth user in the dashboard would cascade through profiles, projects, project_documents and compositions. There are no buckets to clear.

## Export and phone

### 15. Does invoice PDF export work, and is the phone view usable? PDF built; phone partly built, not tested.

- [invoicePdf.tsx](../src/export/invoicePdf.tsx) and [exportInvoice.ts](../src/lib/exportInvoice.ts), tested in Node on a complete, a barely begun and a two-page invoice.
- Export is blocked with the missing items named. The PDF uses Helvetica, not the brand font.
- There is no dedicated phone review view, only narrow-width rules:
  - The chat goes below the workspace under 64rem ([Home.css:238](../src/pages/Home.css#L238)).
  - Windows stack under 940px ([GridWorkspace.tsx:80](../src/components/GridWorkspace.tsx#L80)).
  - The guide becomes one column under 42rem.
  - The library has a 34rem rule.
- None of this has been tested on a phone.

## Evidence and history

### 16. Does the compositions table log outcomes, and what are the counts? Built; the only real data is development testing.

- The table logs `valid | retried | fallback | error` ([compositions.sql](../supabase/migrations/20261005000100_compositions.sql)).
- For the deployed counts, run this in the Supabase SQL Editor:

```sql
select outcome, count(*) from compositions group by outcome;
```

- Local development log (`.droplet/compositions.jsonl`, git-ignored), 3 to 11 October 2026:
  - All 287 requests: 265 valid, 8 retried, 2 fallback, 12 error.
  - The 274 chat requests (background summaries and digests left out): 253 valid (92.3%), 8 retried (2.9%), 1 fallback (0.4%), 12 error (4.4%).
- The only full eval run saved is from 5 October: 52 requests, 26 passed. The test set now has 72 and has not been re-run.

### 17. Commits after 24 September that changed behaviour in response to research

All 82 commits are dated 2 to 10 October 2026, after the interviews. The first commit's CLAUDE.md already held the research table, so these commits build the findings in rather than undo earlier behaviour. No commit message mentions the interviews, so the links below are a reading, not a record:

| Commit | Date | Finding |
|---|---|---|
| `b386469` | 2 Oct | Undo and redo for the palette (manual control) |
| `bcfd29d` | 3 Oct | One AI turn is one undo step, and the AI cannot save |
| `66b29d7` | 4 Oct | Number stays across revisions; business and clients remembered on confirm |
| `398d03b` | 4 Oct | Confirm note before saving; export names what is missing |
| `4d4772b` | 4 Oct | No address, contact or bank details sent to the AI; prices only from the founder |
| `826924b` | 5 Oct | Business name decided once and reused on invoices |
| `0c477f8` | 5 Oct | RLS and cascade delete |
| `7d8a6b1` | 5 Oct | Composition log keeps "none of the founder's words" |
| `d5b1eea` | 6 Oct | Opens a workspace only when asked (prediction is the weak point) |
| `3928e13` | 8 Oct | Facts with no private details, Undo, edit and forget |
| `6713d63` | 8 Oct | Undo this on each reply |
| `f671db5` | 8 Oct | Library shows invoices changed since export |
| `25dc2ee` | 10 Oct | Droplet's changes shown where they can be edited |

### 18. Is there anything from before 21 September showing the original assumptions?

Not in the repo, but there is one outside it.

- The earliest commit is `8bfbab8` on 2 October.
- `~/Documents/droplet-pitch/deck/` (index.html, Droplet-Pitch.pdf, CHANGES.md) is dated **21 September**, the submission day itself, not before. It is not under git.
- It mentions no interviews, so it is the best record of the assumptions before the primary research:
  - Undo and memory edit and delete were Nice to have, and undo was first on the cut list ("Cut list, in order 1. Nice to have: theme, email signature, quotes, undo").
  - The compositions table was to hold "request, route, spec and outcome".
  - It says nothing about stable invoice numbers or remembering clients.
- CHANGES.md mentions an earlier 59-slide version.

### 19. What from the DV300 pitch has been dropped, changed or deferred?

**Changed:**

- The start screen became a chat-first Home.
- The intent bar moved from the top to a chat docked at the side or bottom.
- The project rail and action bar became Save in the header plus the Project brief and Library.
- `WorkspaceSpec` (components, regions, three templates on 12 columns) became turns of actions on a 24-column grid the founder arranges.
- Ideation became a FigJam-style board, plus tables in the chat.
- The fallback layout became "change nothing / ask".
- One Flash model became Quick and Advanced, with Google Search added.
- The planned memory tables became one JSON document per project and kind.
- The compositions log stores no request text and has no project link.

**Not built or deferred:**

- Logo handoff and import slot.
- Type pairing (deferred until after the presentations).
- Client email (the draft pair).
- Dependency tracking.
- Storage bucket.
- Delete account.
- Landing page and Projects screen; new projects cannot be made from the sidebar.
- Quotes (the data model exists, no screens).
- Email signature.

**Added beyond the pitch:** Guide mode, project facts and brief, memories of past chats, notebook, library, web search.
