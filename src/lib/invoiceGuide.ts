import { z } from 'zod'
import { computeTotals, dueDateOf, lineIsBlank, type InvoiceContent } from './invoice.ts'
import type { Issue, Readiness } from './invoiceReadiness.ts'

// The six parts of the invoice, in a fixed order, the same in both modes: Guide mode shows one at a time until it is finished, and Workspace mode shows them all
// stacked in the panel. The names and the order are the app's, here.
// The order is the app's, never the model's, so a founder always knows what comes next. A step is left only when the founder presses
// Continue, and only once nothing required of it is outstanding (from the same check the export uses). A founder can always go back
// to a step they have already reached.

export const GUIDE_STEPS = ['business', 'vat', 'client', 'lines', 'terms', 'review'] as const
export type GuideStepId = (typeof GUIDE_STEPS)[number]

export const GUIDE_TITLES: Record<GuideStepId, string> = {
  business: 'Your business',
  vat: 'VAT',
  client: 'Client',
  lines: 'What you are charging',
  terms: 'Invoice details',
  review: 'Review',
}

// The names on the task bar, short enough for six to sit side by side.
export const GUIDE_SHORT: Record<GuideStepId, string> = {
  business: 'Business',
  vat: 'VAT',
  client: 'Client',
  lines: 'Items',
  terms: 'Details',
  review: 'Review',
}

// One line under each part's title, on what it asks for. It is the part's reason on screen (manifesto principle 3).
export const GUIDE_LEADS: Record<GuideStepId, string> = {
  business: 'Who the invoice comes from. Entered once, it is on every invoice after this one.',
  vat: 'Whether you charge VAT. Leave it off unless SARS has given you a VAT number.',
  client: 'Who the invoice is for. Pick a client you saved, or add a new one.',
  lines: 'Each thing you are charging for, with a quantity and a price. The amounts are worked out for you.',
  terms: 'The number, the date and when payment is due.',
  review: 'Everything the invoice needs before you can export it, checked in code.',
}

// Where the founder is in the guide for one invoice: the step on screen, and the furthest step reached (by its place), which they can go back to.
export type GuideProgress = { invoiceId: string; step: GuideStepId; reached: number }

export const startGuide = (invoiceId: string): GuideProgress => ({ invoiceId, step: GUIDE_STEPS[0], reached: 0 })

// The progress for this invoice, or a fresh start for another one.
export const progressFor = (progress: GuideProgress | null, invoiceId: string): GuideProgress => (progress && progress.invoiceId === invoiceId ? progress : startGuide(invoiceId))

export const stepIndex = (step: GuideStepId) => GUIDE_STEPS.indexOf(step)

// The step that fixes something the invoice check names. The check's parts and the guide's steps have the same names.
export const stepOfFix = (fix: Issue['fix']): GuideStepId => fix

// What still holds a step back: what is required of its part. The last step is held back by everything that is required.
export function stepBlockers(step: GuideStepId, readiness: Readiness): Issue[] {
  if (step === 'review') return readiness.required
  return readiness.required.filter((issue) => issue.fix === step)
}

// Continue: the next step, if nothing holds this one back. The last step has nowhere to go; finishing it is the founder's confirm.
export function advance(progress: GuideProgress, readiness: Readiness): { progress: GuideProgress; blocked: Issue[] } {
  const blocked = stepBlockers(progress.step, readiness)
  const index = stepIndex(progress.step)
  if (blocked.length > 0 || index === GUIDE_STEPS.length - 1) return { progress, blocked }
  const next = index + 1
  return { progress: { ...progress, step: GUIDE_STEPS[next], reached: Math.max(progress.reached, next) }, blocked }
}

export function back(progress: GuideProgress): GuideProgress {
  const index = stepIndex(progress.step)
  return index === 0 ? progress : { ...progress, step: GUIDE_STEPS[index - 1] }
}

// A step the founder has reached can be gone back to, and forward again as far as they got. One further on cannot be skipped to.
export function goTo(progress: GuideProgress, step: GuideStepId): GuideProgress {
  return stepIndex(step) <= progress.reached ? { ...progress, step } : progress
}

// Something outside the guide sends the founder to a step (a Fix button on the checklist, or Edit in the library). It counts as reached.
export function jumpTo(progress: GuideProgress, step: GuideStepId): GuideProgress {
  return { ...progress, step, reached: Math.max(progress.reached, stepIndex(step)) }
}

// The parts of the invoice that differ between two versions of it, in the guide's order, so a change Droplet made can be shown where it was made.
// Worked out from the invoice itself, so an undo or a redo is covered as well as each action. The VAT number belongs to the VAT step.
export function changedSteps(before: InvoiceContent, after: InvoiceContent): GuideStepId[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const { vatNumber: vatBefore, ...businessBefore } = before.business
  const { vatNumber: vatAfter, ...businessAfter } = after.business
  const changed: Record<GuideStepId, boolean> = {
    business: !same(businessBefore, businessAfter),
    vat: before.vatRegistered !== after.vatRegistered || vatBefore !== vatAfter,
    client: !same(before.client, after.client),
    lines: !same(before.lines, after.lines),
    terms: !same(before.details, after.details),
    review: false,
  }
  return GUIDE_STEPS.filter((step) => changed[step])
}

// In Guide mode, the step to show after Droplet changed the invoice: the first part it changed, unless the founder is already looking at one of them.
export function stepToShow(current: GuideStepId, changed: GuideStepId[]): GuideStepId | null {
  if (changed.length === 0 || changed.includes(current)) return null
  return changed[0]
}

// The parts of the invoice the things a change touched belong to, in the order of the parts: a field by what it holds (`client.name` is the client),
// a line of the invoice is the items, and a part is itself.
const PART_OF_FIELD: Record<string, GuideStepId> = { business: 'business', vat: 'vat', client: 'client', details: 'terms' }

export function stepsOfTargets(targets: { kind: string; id: string | number }[]): GuideStepId[] {
  const parts = new Set<GuideStepId>()
  for (const target of targets) {
    if (target.kind === 'line') parts.add('lines')
    else if (target.kind === 'field') {
      const part = PART_OF_FIELD[String(target.id).split('.')[0]]
      if (part) parts.add(part)
    } else if (target.kind === 'part' && (GUIDE_STEPS as readonly string[]).includes(String(target.id))) parts.add(target.id as GuideStepId)
  }
  return GUIDE_STEPS.filter((step) => parts.has(step))
}

// A finished invoice, as the card in the chat shows it. Only the number, the client's name, the dates and the sums: never an address, a
// contact or a bank detail. It is kept with the chat, and the card opens or exports the saved invoice by its id.
export const invoiceResultSchema = z.object({
  invoiceId: z.string().min(1).max(80),
  title: z.string().max(40),
  number: z.string().max(40),
  client: z.string().max(80),
  totalCents: z.number().int().min(0),
  issueDate: z.string().max(10),
  dueDate: z.string().max(10).nullable(),
  lines: z.number().int().min(0),
})
export type InvoiceResult = z.infer<typeof invoiceResultSchema>

export function invoiceResultOf(invoiceId: string, content: InvoiceContent): InvoiceResult {
  const totals = computeTotals(content.lines, content.vatRegistered)
  const word = content.details.kind === 'quote' ? 'Quote' : content.vatRegistered ? 'Tax invoice' : 'Invoice'
  return {
    invoiceId,
    title: word,
    number: content.details.number.trim().slice(0, 40),
    client: content.client.name.trim().slice(0, 80),
    totalCents: totals.totalCents,
    issueDate: content.details.issueDate,
    dueDate: dueDateOf(content.details),
    lines: content.lines.filter((line) => !lineIsBlank(line)).length,
  }
}

// What the message with the card says. It goes to the composer with the rest of the conversation, so it carries no amount and nothing
// private: the number and the client's name are already in what the composer is shown.
export function resultMessage(result: InvoiceResult): string {
  const what = `${result.title} ${result.number || 'without a number'}`
  const forWhom = result.client ? ` for ${result.client}` : ''
  return `${what}${forWhom} is finished and saved. Export the PDF from the card to share it, or tell me what to do next.`
}
