# Droplet: Developer Guide

Droplet is an adaptive AI workspace that reads intent from small business owners and assembles task-specific interfaces (brand, invoice, board) from a bounded component library.

## Commands
- **Dev Server**: `npm run dev`
- **Typecheck**: `npx tsc -b`
- **Lint**: `npx oxlint`
- **Test**: `npm test` (or `npx vitest run <path/to/file>`)
- **Build App**: `npm run build`
- **Build Edge Function**: `npm run build:edge`

## Hard Rules & Conventions
1. **Tone & Language**: British English spelling, factual and plain tone, no marketing fluff, no em dashes.
2. **Git & Attribution**: Never add `Co-Authored-By` trailers or any attribution / "Generated with" lines to commit messages, pull requests, issues or any GitHub content.
3. **Testing**:
   - Never test features in a browser yourself (no browser pane, no Chrome, no screenshots or scripted pointer events). Rikus reviews visual features by hand.
   - Verify changes with `npx tsc -b`, `npx oxlint`, and `npm test`. Write unit tests for new logic.
   - Always say plainly in responses that visual and interactive behaviour has not been checked.
4. **Visual & UI Design**:
   - Always use semantic tokens from `src/styles/tokens.css` (`--text`, `--bg`, `--accent`, `--button`, etc.). Never hardcode raw hex codes.
   - All components must support light and dark modes via `:root[data-theme='dark']`.
   - **Icons**: Solar icon set only (`@solar-icons/react/linear`). Never install or use Lucide.
   - **Typography**: Google Sans (`@fontsource-variable/google-sans`), weights 400 to 700 only.
   - **Layout**: Workspace frame is fixed (`WorkspaceShell.tsx`: 3/5 stage on the left, 2/5 tools panel on the right). Do not re-introduce draggable, resizable, or user-built window layouts.
5. **Data & Money**:
   - Money and financial amounts are always represented as whole integer cents (`src/lib/money.ts`).
   - Private client details (addresses, phone numbers, bank details) are never sent to the LLM.
6. **AI Composition Engine Boundaries**:
   - The AI returns a validated `WorkspaceSpec` (Zod schema in `src/compose/`). It never returns raw prose to render UI, never calculates VAT or financial totals, never invents prices, and never commits to memory without explicit user confirmation.
   - Client never calls Gemini directly; requests go through the Supabase Edge Function `compose`.

## Codebase Map
- `src/components/`: Bounded UI component library and workspace shells (`invoice/`, `board/`, `WorkspaceShell.tsx`).
- `src/compose/`: Prompt engineering, Zod specs, response validators, and rule engines.
- `src/lib/`: Domain business logic (money calculation in cents, colour math, storage drivers).
- `src/pages/`: Route screens (`Home.tsx`, `SignIn.tsx`, `Welcome.tsx`, `Account.tsx`).
- `src/store/`: Zustand stores for client state (`auth.ts`, `workMode.ts`).
- `server/`: Edge functions, streaming handlers, and local dev proxy.
- `supabase/`: Database migrations and local setup instructions.
