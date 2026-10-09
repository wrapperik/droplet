import { z } from 'zod'
import { computeTotals, dueDateOf, lineIsBlank, type InvoiceContent } from './invoice.ts'
import type { Issue, Readiness } from './invoiceReadiness.ts'

// Guide mode for the invoice: one part of the invoice at a time, in the middle of the screen, in a fixed order, until it is finished.
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
  review: 'Review and finish',
}

// The names in the row of steps above the guide, short enough for six to sit side by side.
export const GUIDE_SHORT: Record<GuideStepId, string> = {
  business: 'Business',
  vat: 'VAT',
  client: 'Client',
  lines: 'Items',
  terms: 'Details',
  review: 'Review',
}

// One line under each step's title, on what it asks for.
export const GUIDE_LEADS: Record<GuideStepId, string> = {
  business: 'Who the invoice comes from. Entered once, it is on every invoice after this one.',
  vat: 'Whether you charge VAT. Leave it off unless SARS has given you a VAT number.',
  client: 'Who the invoice is for. Pick a client you saved, or add a new one.',
  lines: 'Each thing you are charging for, with a quantity and a price. The amounts are worked out for you.',
  terms: 'The number, the date and when payment is due.',
  review: 'The invoice as your client will get it. Finish to save it.',
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
