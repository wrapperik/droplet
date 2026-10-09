# 01 Base and Advanced modes

**Goal:** every reply comes from Flash Lite unless the founder selects Advanced, which uses 3.8 Flash with Google Search, 10 a day per founder.

## Server
- `composeRequestSchema` (`src/compose/spec.ts`): add `mode: 'base' | 'advanced'`, default `base`.
- Settings (`server/composeEnv.ts`, `.env.example`, `docs/deploy.md`): `GEMINI_BASE_MODEL` (default `gemini-3.5-flash-lite`), `GEMINI_ADVANCED_MODEL` (default `gemini-3.8-flash`), `GEMINI_BASE_THINKING` (default `low`), `COMPOSE_ADVANCED_PER_DAY` (default 10). Keep `GEMINI_MODEL` as an alias for the advanced model.
- `composeService`: choose the model from the mode. Base never searches and has no fallback model. Advanced searches (the model decides) and falls back to Base when 3.8 Flash is overloaded or its quota is used.
- Allowance: count the founder's Advanced requests over 24 hours. Dev server: in memory, like `createSearchAllowance`. Edge function: from `compositions` (migration adds `mode text`). An Advanced request with none left is refused before the model is called, with a plain message and when it resets. The search allowance becomes part of Advanced.
- When Advanced falls back to Base because of Google's quota (not the founder's), it does not count against the founder's 10, and the reply says "Advanced is busy today, so I answered with Quick."
- Every response carries `answeredBy: 'base' | 'advanced'` and `allowance: { advancedLeft, advancedLimit, resetsAt }`.
- `gemini.ts`: a 429 on a request with search on is retried once on the same model without search, and remembered for an hour (as a 400 already is). Log when a search was asked for but refused.
- Log `mode` and Gemini's `usageMetadata` (prompt, answer and thinking tokens) per request: in `.droplet/compositions.jsonl` and in `compositions` (migration adds the columns). Never show tokens to founders.

## Prompt
- Base prompt: drop `LOOKING_UP`; say it cannot search, and when an answer depends on current facts, say it may be out of date and that Advanced in the menu can look it up. No new field, no button.
- Send only the examples for the workspace on screen in the base prompt, to shorten it.

## Interface
- A mode button in the intent bar (`IntentBar.tsx`) opens a two-row menu (reference `docs/ui-references/06-tools-menu-composer.png`): **Quick** and **Advanced**, with a quiet note on Advanced: "Searches the web · 7 of 10 left today".
- When Advanced is selected, a small "Advanced" pill shows in the bar; pressing it turns it off. It applies to the next message only, then goes back to Quick.
- When none are left, the row is disabled and says when it resets. Never hidden.
- The count comes from the last response's `allowance`. Before the first message, ask the server (a small `GET` on the same function, or read the founder's own `compositions` rows, which RLS allows).

## Tests
Mode picks the model; Base never sends search; the allowance refuses the 11th; Google's quota does not count against the founder; the 429-with-search retry; the response carries the allowance; the menu shows the count and disables at zero; the pill clears after sending. Add an `EVAL_MODE` switch to `npm run eval:compose`.
