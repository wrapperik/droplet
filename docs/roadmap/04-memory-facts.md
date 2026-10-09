# 04 Memory: facts

**Goal:** Droplet proposes facts about the business, the founder confirms them, and every later chat knows them.

## Schema
Add to the shared conversation fields (`conversationFields.ts`), so all three turn schemas have it:

```ts
propose: z.array(z.object({
  key: z.enum(['profile.stage', 'profile.what', 'profile.who_for', 'profile.where', 'brand.values', 'brand.voice',
    'brand.fonts', 'logo.status', 'business.name', 'business.offer', 'business.pricing', 'preference.style']),
  value: z.string().max(200),
  quote: z.string().max(120), // the founder's words it came from
})).max(3).optional()
```

- Rule (`rules.ts`): the quote must be in the founder's messages (same comparison as `checkOpening`'s `plain`). No address, email, phone or bank detail in a value (test).

## Storage
Keep the document approach: add `facts` to the `memory` document (`projectMemory.ts`): per key, the current value, when it was confirmed, the chat it came from, and earlier values (kept, so a change can be undone). `idea.name` and `idea.offer` stay as they are and also show as `business.name` and `business.offer`.

## Interface
- Under the reply, chips: "Remember: DuckStack builds full-stack software for SMEs" with **Remember** and **Not now** (Not now hides that key for this chat).
- A value that differs from the current one shows both: "Update who it is for. Was: any small business. Now: corporate clients. Update · Keep the old".
- After Remember, a quiet toast with Undo.
- **Project brief** panel, opened from the project switcher: every fact under plain headings (About the business, Brand, Preferences) with Edit and Forget (asks twice), and "Add something Droplet should know". Also holds the switches from chunks 05 and 06.

## Prompt and project
- `snapshotOfProject` and `describeProject`: send current facts. `doneSteps` ticks values and the logo from facts.
- Prompt: propose a fact only when the founder has said it, at most three per reply, never what is already remembered with the same value. Ask fewer getting-to-know-you questions when facts answer them. `preference.style` changes how Droplet writes.

**Tests:** quote check; no private details; Remember stores and Not now does not; update keeps the old value; describeProject includes facts; a new chat's request carries them. Eval: a founder states their stage and audience, and the reply proposes both.
