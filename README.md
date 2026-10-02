# Droplet

Software that takes the shape of the work. An AI workspace that reads what a small business owner is trying to do and assembles the interface for it.

Project context lives in [CLAUDE.md](CLAUDE.md).

## Setup

```bash
npm install
cp .env.example .env   # fill in Supabase values when the backend exists
npm run dev
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and production build |
| `npm run typecheck` | Typecheck only |
| `npm run lint` | oxlint |
| `npm test` | Vitest, single run |
| `npm run test:watch` | Vitest, watch mode |

## Layout

- `src/components`: component library and workspace frame
- `src/schemas`: Zod schemas, including `WorkspaceSpec`
- `src/store`: Zustand stores
- `src/pages`: routed screens
- `src/lib`: Supabase client and pure helpers (contrast, totals)
- `supabase/functions/compose`: Edge Function, the only place the Gemini key exists
- `supabase/migrations`: Postgres schema and RLS
