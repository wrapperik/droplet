# Droplet

Software that takes the shape of the work. An AI workspace that reads what a small business owner is trying to do and assembles the interface for it, from a fixed library of tested components.

Final-year project by Rikus Pretorius (Bachelor of Creative Technologies, Open Window): DV300 Theme 4 (AI-driven application) and UX300 Term 4 capstone.

- Live: https://droplet-tan.vercel.app
- Full project context, design rules and decisions: [CLAUDE.md](CLAUDE.md)
- Build roadmap: [docs/roadmap/](docs/roadmap/README.md)

## What it does

- **Chat first.** The founder describes what they need. Gemini replies with a validated turn (a message plus actions from a fixed vocabulary), never with markup or positions.
- **Three workspaces:** a business-idea board, a brand palette with live contrast checks, and an invoice with totals and VAT worked out in code, exported as a PDF.
- **Guide mode and Workspace mode** for the invoice: one step at a time, or every tool at once.
- **Project memory:** business details, clients, the name and offer, and facts about the business, saved only when the founder confirms.
- **Library:** everything made in a project, its status and its exports.
- **Accounts:** email and password or Google, row-level security on every table, and delete account and data from the account page.

## Next: sprint 3 (14 to 20 October 2026)

- [ ] Logo handoff (built, not yet reviewed by hand): a handoff card naming the boundary, a copyable spec panel (palette, fonts, formats, sizes), a link-out in a new tab, and the logo recorded as outstanding ([chunk 12](docs/roadmap/12-logo-handoff.md)). Run the `logo` migration before deploying
- [ ] Import slot (built, not yet reviewed by hand): accept a PNG or SVG, reject a wrong format or size with a reason, and show the logo as resolved in the library and on the invoice page and PDF
- [ ] Usability tests with three people outside the project, one per priority flow (brand, logo, invoice), noted in the bug log
- [ ] Fix every high-severity bug from the tests
- [ ] Re-run the fixed test requests on the deployed function and record the valid, retried and fallback rates
- [ ] Check the phone layout for reviewing and exporting an invoice

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19, TypeScript, Vite, Zustand, Framer Motion |
| Validation | Zod (also generates the Gemini response schema) |
| Backend | Supabase: Postgres with RLS, Auth, Edge Functions |
| AI | Google Gemini (Flash Lite for Quick, Flash with Google Search for Advanced), called only from the `compose` Edge Function |
| PDF | @react-pdf/renderer |
| Hosting | Vercel |

The DV300 milestone sheet lists MERN. The pitch chose Supabase instead of MongoDB, Express and Node: Postgres with row-level security keeps each founder's data theirs with one ownership check, and Edge Functions keep the Gemini key server-side.

## Setup

```bash
npm install
cp .env.example .env   # GEMINI_API_KEY, and VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for accounts
npm run dev
```

Without the two Supabase values the app runs on this device alone, signed in as a sample founder. Setting up the database: [docs/supabase-setup.md](docs/supabase-setup.md). Deploying: [docs/deploy.md](docs/deploy.md).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server, which also serves `/api/compose` locally |
| `npm run build` | Typecheck and production build |
| `npm run typecheck` | Typecheck only |
| `npm run lint` | oxlint |
| `npm test` | Vitest, single run |
| `npm run eval:compose` | Run the fixed test requests against the pinned Gemini model |
| `npm run build:edge` | Bundle the Edge Functions into `supabase/functions/` |
| `npm run deploy:compose` | Build and deploy the `compose` function |

## Layout

- `src/pages`: routed screens (sign-in, introduction, Home, account)
- `src/components`: the workspace shell, the three workspaces, the chat and the sidebar
- `src/compose`: the AI contract: Zod schemas, prompts, rules, and applying a turn to a workspace
- `src/lib`: pure logic (money, VAT, contrast, layout grid, memory, storage drivers), each with tests
- `src/export`: the invoice, brand sheet and board PDFs
- `server`: the compose service, shared by the dev server and the Edge Functions
- `supabase/migrations`: Postgres schema and RLS policies
