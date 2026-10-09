# 12 Logo handoff

**Goal:** the pitch's core flow 3: Droplet says plainly it does not make logos, and hands off with everything the founder needs.

## First version: a brief block in the chat
A new block type, `brief`, in `blocks.ts` and `ChatBlocks.tsx`: what the business does, three words for the feel, where it will be used, the palette's colours with hex codes (from the saved palette, in code), suggested fonts. **Copy all** and Copy per line.

## Handoff card (if time allows)
An overlay in the workspace, opened by a `handoff` turn or from the library's Logo section:
- Why Droplet stops here, in one line.
- Spec panel: palette hex codes, fonts, formats and sizes needed (light and dark, transparent PNG, SVG if possible, square for avatars), each copyable.
- Link out to Canva and Adobe Express in a new tab.
- The logo is recorded as outstanding (shown in the library).
- Import slot: accepts PNG or SVG under a size limit, rejects with a plain reason, stores the file (Supabase Storage, private per founder) and marks the logo resolved. If Storage is not set up yet, leave the slot for later and say so in the card.

**Tests:** the brief takes hex codes from the saved palette, not the model; import rejects wrong types and sizes with a reason.
