# Stable workspace: audit, research and proposal

Written 15 October 2026. Status: **design settled (section 5), build in progress (section 6).** Sections 1 to 4 are the audit and research behind it.

Method: a read-only audit of the code, plus web research on colour and typeface tools, invoice builders, board tools and general guidance on stable interfaces. Page text was read through search and fetch, not seen live, so layout details of other products are unverified and are marked as such. Anything marked "derived" comes from reading CSS and code, not from measuring a running app. Nothing here has been checked in a browser.

---

## 1. Why this change is right

- **Your own testing:** people did not realise a tool could be dragged onto the board. Rearranging is unconventional, so it is a hidden gesture.
- **The evidence agrees.** Figma tried floating panels everywhere and moved to fixed, docked, resizable panels because floating ones "slowed people down" (Figma, "Our approach to designing UI3"). A survey found under 5% of Word users had changed any of 150+ settings, so defaults carry the product (UIE; it is about settings, so applying it to layout is an inference). Norman and Nielsen argue that gesture-driven interfaces break visibility and discoverability.
- **The code agrees.** The audit found the grid is the main source of instability (section 3).
- **Manifesto fit:** this removes an interaction that fails principle 8 (offer the familiar path) and puts weight on principle 2 (replace what you remove): the tools, preview and checklist must be visible and in the same place every time.

The earlier angle, "the user decides the structure of their own workspace", is retired. Predictability now comes from a fixed frame. The user still decides **what is open** (preview, checklist) and **which mode** (Guide or Workspace), not where things sit.

---

## 2. What is in the code today

One shared stack carries the mechanic: `arrangement.ts` (state), `gridLayout.ts` (maths), `GridWorkspace.tsx` (drag and resize), `ToolShelf.tsx` (toolbar drag, pull-out, add and remove), `WorkspaceShell.tsx` (glue) and `lift.ts` (the carried copy). All three workspaces sit on `WorkspaceShell`. Guided invoice does not use the grid and is already a fixed split.

| Workspace | Toolbar today | Windows today |
|---|---|---|
| Palette | Three tools with live controls in the bar (colour picker, role, Generate), plus a `+` menu | Palette canvas (14 columns), document preview (10). Each tool also has a second, big form: colour wheel, role cards, harmony cards |
| Invoice workspace | Seven steps (Invoices, Your business, Client, Terms, VAT, Total, Ready to export) with ticks; pressing one opens its window | Invoice page (14), line items (10), plus seven step windows (8 each) that land wherever compaction puts them |
| Invoice guide | None; stepper row, Back and Continue | Fixed split: live page left, one step right |
| Board | Seven tools, tool-in-hand with options sliding out | None. The canvas fills the screen outside the grid |

Size of the removal (from the audit): about **2,600 source lines** and **900 to 1,000 test lines** are deletable, and 300 to 500 test lines need editing, mostly fixtures. About 670 more lines go if the three big tool windows are dropped rather than promoted.

**Worth keeping** (the audit and I agree): one reducer vocabulary per workspace with the AI going through it and one undo step per turn; async Zod-validated storage and the `useLoaded` gating; the guided invoice layout; the invoice page scaling by container width; the toolbar's glass look; step ticks from `checkInvoice`; the board's tool-in-hand model; receipts built in code; reduced-motion handling.

---

## 3. Audit findings: what makes it feel unreliable

1. **The narrow fallback is the common case (derived).** The grid switches to a stacked layout below 940px of workspace width. With the sidebar and the docked chat, a 1440px laptop with the sidebar collapsed gives about 938px, and 1280px gives about 819px. So many people see the stacked fallback, where windows are full width, in a different order, with no handles. This is the single biggest finding: **the new design must work at 800 to 1000px of workspace width first, and treat wider as a bonus.**
2. **Wide and stacked do not match.** Stack order lists tools before panels, so an opened step window sits above the invoice page when stacked and beside or below it when wide. Crossing 940px unmounts and remounts every window, replaying the blur-in and dropping any uncommitted local state.
3. **Windows land out of sight (derived).** Compaction puts a window as high as it fits. In the default invoice layout, Business, VAT and Client overlap the tall invoice page's columns, so they can only land below it. This is why `fix()` has to scroll to them.
4. **Ragged heights.** Windows keep their own heights, and the first frame is laid out against a default of 24 rows before measuring, then shifts.
5. **The toolbar wraps and changes width (derived).** Seven labelled invoice steps are wider than a laptop with the chat docked, so the bar wraps. On the board the options slide open beside the tool in hand, so the bar's width changes as you work.
6. **Tools have two forms.** Each palette tool is a compact control and a big window, kept in sync only by the reducer. Two UIs to maintain per tool.
7. **Three toolbar behaviours in one 391-line component.** Controls in the bar (palette), steps that open windows (invoice), tool in hand (board).
8. **Dead or misleading controls.** The board shows a `+` menu whose entries are all disabled, and a Reset layout button that does nothing unless tools were reordered. The invoice confirm note says "Saving keeps how the workspace is arranged" to someone who never arranged anything. A moved window turns Save to "Unsaved changes" and can trigger the leave-without-saving prompt.
9. **Hidden affordances.** The move and resize grips are invisible until hover or focus. That matches your test result.
10. **Two mechanisms for "show what Droplet changed":** `stepToShow` in Guide mode and `revealActions` in Workspace mode. A fixed layout lets these become one.
11. **Test coverage gap.** The jsdom setup stubs `ResizeObserver`, so every component test renders the stacked branch. Nothing tests the real grid, drag or resize at component level. The suite cannot catch regressions in the old behaviour, and it will not catch layout regressions in the new one either, so it needs hand checks at several widths.

---

## 4. Research summary

### Stability and discoverability (NN/g, Figma, Material)
- Visible labels beat icons. Only home, print and search are widely recognised, hover-only labels cost effort and fail on touch. **Droplet's icon-only toolbar with tooltips is its weakest point after the dragging.**
- Tooltips must work on hover and keyboard focus, and must not hold task-critical information.
- Keep disclosure to two levels. Staged flows fail when steps are interdependent, which is why Workspace mode must stay alongside Guide mode.
- Docked panels suit sustained work. Modals are for critical confirmations. Popovers are for short choices. Reserve space for a panel before it opens so nothing shifts.
- Teach with contextual hints at the moment of need, not a tour.

### Colour tools
- **Adobe Color:** a rule list (analogous, monochromatic, triad, complementary, split complementary, and more), a permanent wheel with a base-colour marker, a five-swatch strip, a colour-mode dropdown and numeric fields, all visible together. Contrast is a separate tab with a Pass or Fail preview. Whether it has a lock on the wheel view is unconfirmed.
- **Coolors:** large full-height columns, per-column lock, regenerate only the unlocked. Generate is on the spacebar, which is a hidden trigger; Droplet needs a visible button.
- **Realtime Colors:** five role slots (text, background, primary, secondary, accent), a contrast mark on each, a scheme selector, heading and body font slots in the same panel. The preview is a generic web page; Droplet's should be the founder's own document.
- **Material Theme Builder, Huemint:** one primary drives the rest; generating around locked colours. Both use vocabulary to avoid in front of non-designers.
- **Leonardo:** contrast as a goal ("make this pass 4.5:1") rather than a check afterwards. Worth borrowing as the "Make it more readable" action.

### Typeface pairing
Fontjoy: a similar-to-different control, a lock on one font, editable sample text. For non-designers: show a pair as heading plus body on a card, using the founder's own text, offer three or four curated pairs with a one-line reason before any free search, and preview in the palette's colours so type and colour judge each other.

### Guided flows
Looka, Brandmark, Tailor Brands and Khroma all ask a few cheap questions, show options, then hand over to an editor. Khroma's long upfront training is the cited drawback. Choice-overload evidence is mixed (a meta-analysis found a mean effect near zero; overload is worse when the task is hard and preferences are unsure, which is a novice choosing a palette). Three clearly different options with a "show more" is a reasonable start. No source gives a right number, so test it.

### Invoice tools
Fixed section order business, client, details, items, totals (FreshBooks and your six guide steps match). Branding set once and applied (Wave; matches your confirmed palette). Auto-numbering with a small change affordance (Zoho). An explicit review step before the irreversible action (Stripe). **Never show a figure only in the preview** (Xero complaint). **A preview must be instant** (Invoice Ninja complaint; yours is HTML and CSS, so it already is). Totals directly under the line items.

### Board tools
Miro: vertical toolbar on the left. FigJam and tldraw: bottom centre. All keep options for the tool in hand next to the tool. Templates are a toolbar item. Droplet's top-centre toolbar is defensible because the board scrolls under the header, but it is furthest from where attention sits.

### South African invoice rules (checked against SARS)
Full tax invoice over R5 000, abridged allowed at R5 000 or less, none needed at R50 or less. Droplet's current checks match. One thing to confirm against the live SARS guide: the fetched page lists the recipient's address as required on a full tax invoice, and Droplet requires it only above R5 000. This is a content question, separate from this layout work.

### Not verified
Apple HIG toolbar text, Miro and Wave help pages, Material's official side-sheet page, Mural, QuickBooks, Canva invoices, and any figure for how many people discover drag gestures could not be fetched or found. Do not quote these in the case study without checking. Check Adobe Color, Coolors and Realtime Colors by hand before wireframing against them.

---

## 5. The settled design (reviewed 15 October 2026)

This replaces the first proposal. The first version put a new left rail in every workspace. That does not fit: the app already has the sidebar on the left and the docked chat on the right, and the workspace is often only 800 to 1000px wide. The settled design takes the one layout that already works at that width, the guided invoice, and makes it the frame for every task.

### The rule: one frame, one list of parts per task, two modes

Every workspace is built from the same pieces, in the same places:

```
+------------------------------------------------------------------+
| Header:  Undo Redo [task menu]   |  logo  |   status  Save  Export |
+------------------------------------------------------------------+
|              Task bar (the parts of this task, labelled)          |
+-------------------------------------+----------------------------+
|                                     |                            |
|  The thing being made               |  Tools panel               |
|  (invoice page, palette and         |  (Workspace: every part    |
|   preview, the board)               |   stacked. Guide: one      |
|                                     |   part at a time)          |
|                                     +----------------------------+
|                                     |  Guide only: Back  Continue |
+-------------------------------------+----------------------------+
```

- **Header.** Undo and Redo on the left, then any menu that belongs to the task (the invoice's "Invoices" menu: new, open, copy, forget). Save with its status note and Export on the right. Same order in every task and both modes. No Windows menu, no Reset layout.
- **Task bar.** The same glass pill under the header, never draggable, never wrapping on a laptop, every item an icon **with its label visible**. For a task with parts (invoice, brand) it lists the parts, each with the empty ring or the filled tick. For the board, which is free-form, it lists the tools.
- **The thing being made**, on the left, about three fifths of the width. It scrolls on its own.
- **The tools panel**, on the right, about two fifths. It scrolls on its own. The board has no panel: its canvas fills the screen, as now.
- **Under about 42rem** of width the two panes become one column (the panel first, then the thing), in the same tree, so nothing remounts.
- **Nothing is moved, resized, hidden or opened as a window.** Popovers (colour spectrum, template menu) and dialogs (confirm note, handoff card, leave check) are the only things that open.

**Guide mode and Workspace mode use the same frame, the same list of parts, the same names, icons and components.** The only differences:

| | Workspace mode | Guide mode |
|---|---|---|
| Tools panel | Every part, stacked, in order | One part at a time |
| Task bar | Press a part to scroll to it and put the cursor in its first field | The stepper: press a part already reached to go back to it; parts not reached yet are shown but cannot be pressed |
| Footer of the panel | None | Back, what is missing, Continue (Finish on the last part) |

So a founder who has done one task in one mode has learnt every task in both: the parts are always on the bar, the thing is always on the left, the tools always on the right.

### Invoice

One list of parts, used by both modes, in the order of the guide (which is also the order of the law and of FreshBooks): **Business, VAT, Client, Items, Details, Review** (full titles: Your business, VAT, Client, What you are charging, Invoice details, Review). This ends the current mismatch, where Workspace mode had a different seven (Invoices, Your business, Client, Terms, VAT, Total, Ready to export?) in a different order.

- Left: the A4 page (`InvoiceDocument`), as now.
- Right: the parts. **Items** holds the line items with the totals directly under them (totals are never only on the page). **Review** holds the checklist; its Fix buttons go to the part that fixes it (scroll in Workspace, jump in Guide).
- Header: an **Invoices** menu (new, open, copy, forget, with the existing leave check) in both modes, replacing the Invoices window.
- The ticks come from one function keyed by these six parts, used by both modes and the Export button's blocked state.

### Brand

Three parts: **Colours, Roles, Contrast**.

- Left: the palette blocks (`PaletteCanvas`) and, under them, the document preview, which updates as colours change.
- Right, Workspace mode, all at once in the Adobe Color manner: **Colours** (the colour wheel with every colour on it, the selected colour's hex and RGB fields, the harmony choice and a visible Generate button), **Roles** (the four role cards), **Contrast** (each key pair with its ratio and "Passes AA" or "Fails AA" with an icon, never colour alone).
- Guide mode, the same three parts one at a time:
  1. **Colours.** Pick one to three colours you like (chips, added by the spectrum or a hex code). Droplet then shows three palettes, **built in code** from `harmony.ts`: one around each favourite as the primary, or a blend that keeps all of them. Each option is a card with its swatches and contrast in words. Pick one, or ask for three more. Choosing one sets the palette (one undo step) and the page on the left shows it.
  2. **Roles.** The four role cards.
  3. **Contrast.** The pairs, and **Make it more readable**, which moves the text or background colour in code until it passes AA (one undo step). **Finish** saves the palette, closes the brand workspace, and Droplet posts a message with a small result card (the swatches, Export brand sheet, Open), as the finished invoice does.
- A typeface pairing, when it is built, is a fourth part (**Type**) in the same panel, and the page uses it. No split view is needed.

### Board

- The task bar holds the seven tools with their labels. The options of the tool in hand open in a small fixed strip just under the bar, so the bar itself never changes width.
- No `+` menu, no Reset layout, no reordering.
- An empty board shows a quiet prompt in the middle: pick a template (three or four cards) or choose Sticky note. It goes once anything is on the board.
- The board has no Guide mode yet. It opens the same way in both modes.

### What Droplet (the AI) can do to the layout

Nothing. The five layout actions and `show_component` and `hide_component` are removed, the arrangement is no longer sent to it, and the prompt says plainly that it cannot move, resize, hide or open parts of the screen. "Show me" on a change receipt scrolls to the part (Workspace) or jumps to its step (Guide) and marks the field, through one shared function for both modes.

---

## 6. Build plan

Done by agents in this order. Each chunk is committed on its own once it passes `npx tsc -b`, `npx oxlint` and `npm test`.

1. **Data and AI layer.** Save schemas tolerant of old saves (`layout` optional, saved `tools`, `expanded` and `hidden` ignored), layout actions removed from the composer, its prompt, rules, receipt, snapshot, context and evals.
2. **The frame.** Remove the grid, the carried copy, the toolbar's drag and pull-out, the `+` and Windows menus and Reset layout. Build the shared frame and task bar. Put all three workspaces on it: the invoice with its six parts in both modes, the brand with its three parts in Workspace mode, the board with its labelled tools.
3. **In parallel:** the brand's Guide mode; the board's options strip and empty-board prompt.
4. **Documents.** `CLAUDE.md`, the `APP_KNOWLEDGE` in the prompt, and this file.

## 7. Removal notes from the code audit

The audit's order, which keeps the app compiling and the tests passing at each step. Steps 1 and 2 are protective; they matter because saved data and the deployed `compose` function are shared with older clients.

1. **Make the schemas tolerant first.** `layout` is required in the palette, board and invoice save schemas, so an older cached client reading a save without it would get `null` and show "Not saved yet". Make `layout` optional, make the snapshot fields in `spec.ts` optional, and make `openArrangement` ignore saved `tools` and `expanded` (an old `hidden: ['role']` or `expanded: ['picker']` must not hide or move a tool for good). Deploy the `compose` function before the client stops sending those fields. No database migration is needed: Zod strips unknown keys, and the `invoice` document kind keeps its legacy `content`.
2. **AI layer.** Remove `move_component`, `resize_component`, `expand_tool`, `collapse_tool`, `reset_layout`, `show_component` and `hide_component` from `spec.ts`, `applyActions.ts`, `receipt.ts` and `prompt.ts` (and the worked example that uses `move_component`). Drop the arrangement from `context.ts`, `snapshot.ts` and `fixtures.ts`, and the `onResolved` and `drawnRef` chain in `Home.tsx`. The prompt must say plainly that Droplet cannot rearrange anything. Delete or rewrite eval `act-layout`, then re-run `npm run eval:compose`.
3. **Give the invoice a real "open panel" concept.** In the invoice workspace `expanded` quietly means "which step window is open". Replace it with an explicit active section or tab, then rewrite `revealActions`, `fix()`, `business_details` in Home and `toggleTool` on it. This also unifies the two "show what changed" mechanisms. Replace the three `.gw__item[data-id]` selectors (`arrival.ts`, `InvoiceWorkspace.tsx`, `useRipple.ts`) with a neutral `data-window` attribute.
4. **Build the fixed frame** (CSS grid or flex plus container queries, no measuring) and switch the three workspaces onto it. Largest UI change and the least covered by tests. Remove `GridWorkspace`, `lift`, and the grid's use of `Emerge` (keep `Emerge` itself, `WelcomeScenes` uses it).
5. **Replace `ToolShelf` with the rail.** Remove drag, pull-out, `ComponentsMenu`, Reset layout and the `+` menu. Keep the tooltip, tick and divider styling.
6. **Trim `arrangement.ts`** to open and closed state only, remove arrangement from `isUnsaved`, `leaveCheck` and the confirm-note copy, and stop writing the `invoice` arrangement document on confirm. Delete `gridLayout.ts` and its 487-line test.
7. **Remove dead weight:** the three big tool windows, `ToolWindow`, and the unused ripple (`useRipple`, `ripple.ts`, `RippleGlow`) if it is not coming back. Finally drop the four fields from the save schemas once old clients are gone, or leave them tolerant for good.
8. **Documents.** Rewrite the layout sections of `CLAUDE.md`, the `APP_KNOWLEDGE` text in `prompt.ts`, and the two project memory notes that describe the old angle (done with this proposal, see below).

Do the Guide-mode palette and the typeface pairing **after** step 6, so they are built on the new frame rather than the old one.

### Risks
- **Untested UI.** Hand-check at 1280, 1440, 1512 and 1728 widths, sidebar open and collapsed, chat docked and not.
- **Old saved data** changing meaning (section 7, step 1).
- **Deployment skew** between the client and the `compose` function (steps 1 and 2).
- **Invoice regression** if `expanded` is removed before step 3 exists. The blocked Export button depends on it.
- **AI quality shift** from losing the arrangement block. Re-run the fixed eval requests.
- **Wizard trap.** NN/g warns staged flows fail when steps are interdependent; keep Back always available, state kept across steps, and the Workspace escape hatch visible from step 1.

---

## Sources

Colour and type: color.adobe.com/create; shotkit.com/adobe-color; blog.adobe.com (colour accessibility); coolors.co/generate; realtimecolors.com; khroma.co; codelabs.developers.google.com/customizing-material-color; huemint.com/about; leonardocolor.io; madegooddesigns.com/fontjoy; looka and Tailor Brands reviews (shotkit, techradar, creativebloq).
Evidence: Scheibehenne, Greifeneder and Todd (2010); Chernev, Bockenholt and Goodman (2015); nngroup.com articles on icon usability, tooltip guidelines, progressive disclosure, recognition and recall, wizards, onboarding tutorials, modal and nonmodal dialogs; archive.uie.com "Do users change their settings"; figma.com/blog/our-approach-to-designing-ui3; web.dev/articles/cls.
Boards: help.figma.com (FigJam); help.miro.com (toolbar); tldraw.dev UI components; docs.excalidraw.com; whimsical.com/learn.
Invoices: help.invoicesimple.com; support.waveapps.com; zoho.com/za/billing/help; support.freshbooks.com; docs.stripe.com/billing/invoices; Xero product ideas forum; forum.invoiceninja.com; sars.gov.za/businesses-and-employers/tax-invoices.
