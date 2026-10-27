# Droplet

An AI workspace for small business owners. Droplet reads what the founder is trying to do and assembles the interface for it from a fixed library of tested components: a board for shaping the business idea, a brand palette, and an invoice.

Live: https://droplet-tan.vercel.app

## Features

### Conversation
- **Chat first.** The founder says what they need. The model replies with a validated turn (a message plus actions from a fixed vocabulary), never with markup or layout.
- **Workspaces open from the chat** or from the workspaces menu in the message bar. The chat moves to a side panel beside the workspace.
- **Blocks in the chat:** comparison tables, plans with Open buttons that tick off as the project progresses, logo briefs, and drafts of emails and WhatsApp messages in a box with a Copy button.
- **Web research.** Asking Droplet to research, look up or check something (competitors, going rates, whether a name is taken) searches the web on the server. The sources are listed under the reply.
- **Attachments:** up to three pictures, PDFs or text files per message.
- **Receipts:** every change Droplet makes is listed under its reply, with Undo this and Show me.
- **Chat history:** chats are kept per project, can be pinned and deleted, and short memories of earlier chats help later ones.

### Workspaces
- **Business idea board:** notes, frames and connectors, templates (such as a brain dump, or customer and problem), and Droplet's own notes in pink until the founder keeps them. Exports as PDF or PNG.
- **Brand:** a colour palette with live contrast checks, colour roles, harmony suggestions, a typeface pair and voice words. Exports a brand sheet PDF.
- **Invoice and quote:** business, VAT, client, line items, details and a review checklist. Totals and 15% VAT are worked out in code in whole cents, never by the model. Six templates, the brand's colours and fonts, and the founder's logo. Exports a PDF once nothing required is missing.
- **Guide mode and Workspace mode:** one step at a time, or every tool at once.
- **Fixed frame:** the work on the left (three fifths) and the tools panel on the right (two fifths), the same in every workspace.

### Saving and memory
- **Nothing is saved without the founder's say.** Before work would be lost (closing a workspace, opening another, switching project, signing out) Droplet asks in a dialog in the middle of the screen, with a button to save each thing.
- **Project memory:** business details, clients, invoices and facts about the business, kept only when the founder presses Remember or confirms a save.
- **Project brief and library:** what the project knows, and everything made in it, with its status and exports.

### Logo
- Droplet does not make images. The logo card hands off to Canva or Adobe Express with a copyable spec (palette hex codes, fonts, files to ask for), then takes the finished PNG or SVG back for the invoice and the library.

### Accounts
- Email and password, Google, or a guest account for assessors with no sign-up, kept until they sign out.
- Each founder's projects are theirs alone, enforced by row-level security on every table.
- Deleting the account removes everything in it.

### Known limits
- Built for desktop. On a phone Droplet says so and lets the founder carry on.
- There is no client email workspace and nothing is sent from Droplet: drafts are copied and sent by the founder.

## Changes from the proposal

| Change | Why |
|---|---|
| The model is DeepSeek (V4.1 Flash) instead of Google Gemini | Lower cost per request, and better performance: I have access to DeepSeek's bigger models. |
| Gemini kept as an automatic fallback | If DeepSeek cannot answer (a timeout, no balance, a server error), Gemini's Quick model answers instead, checked by the same rules, so the founder is not left without a reply. |
| Web search through Tavily on the server instead of Google Search in the model | DeepSeek has no built-in search. Searching on the server works with either model and keeps the founder's private details out of every query. |
| No Advanced mode while DeepSeek runs | Advanced was the stronger Gemini model with Google Search. With one DeepSeek model and server-side search it has nothing to add. |
| Supabase (Postgres, Auth, Edge Functions) instead of MongoDB, Express and Node | Row-level security keeps each founder's data theirs with one ownership check, and the model keys stay in Edge Functions, never in the browser. |
| A fixed workspace frame instead of movable, resizable windows | In testing, people did not find the drag gestures, and the moving grid was the main source of layout instability. A fixed frame is predictable. |
| The save question is a dialog in the middle of the screen, not a message in the chat | Testers missed it in the side panel and lost work. |
| Drafts in the chat instead of a client email workspace | Time went to the three core workspaces. A draft with a Copy button covers writing to a client. |
| A guest account on the sign-in screen | Assessors can try Droplet without making an account. |

## Technologies

| Layer | Choice |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, Zustand, Framer Motion |
| Design | Semantic colour tokens with light and dark themes, Google Sans, Solar icons |
| AI | DeepSeek V4.1 Flash, with Gemini Flash Lite as fallback, called only from the `compose` Edge Function |
| AI contract | Zod schemas for every turn and action, checked by code rules, retried once, then a fixed fallback |
| Web search | Tavily, from the server |
| Backend | Supabase: Postgres with row-level security, Auth (email, Google, anonymous), Edge Functions |
| PDF | @react-pdf/renderer |
| Tests | Vitest and Testing Library, oxlint |
| Hosting | Vercel (app), Supabase (database and functions) |

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

In `.env`, set `AI_PROVIDER=deepseek`, `DEEPSEEK_API_KEY` and `GEMINI_API_KEY` (the fallback), and optionally `TAVILY_API_KEY` for research. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for accounts; without them the app runs on this device alone as a sample founder.

- Database: [docs/supabase-setup.md](docs/supabase-setup.md)
- Deploying: [docs/deploy.md](docs/deploy.md)

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server, which also serves `/api/compose` |
| `npm run build` | Typecheck and production build |
| `npm run typecheck` | Typecheck only |
| `npm run lint` | oxlint |
| `npm test` | Vitest, single run |
| `npm run eval:compose` | Run the fixed test requests against the configured model |
| `npm run build:edge` | Bundle the Edge Functions into `supabase/functions/` |
| `npm run deploy:compose` | Build and deploy the `compose` function |
| `npm run deploy:delete-account` | Build and deploy the `delete-account` function |

## Project layout

- `src/pages`: sign-in, introduction, Home and account
- `src/components`: the workspace shell, the three workspaces, the chat and the sidebar
- `src/compose`: the AI contract: schemas, prompts, rules, search, and applying a turn to a workspace
- `src/lib`: logic with tests (money in cents, VAT, contrast, memory, storage)
- `src/export`: the invoice, brand sheet and board PDFs
- `server`: the compose service, shared by the dev server and the Edge Functions
- `supabase/migrations`: the database schema and row-level security policies
