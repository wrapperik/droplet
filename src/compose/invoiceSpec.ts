import { z } from 'zod'
import { TASKS } from './taskNames.ts'

// What the composer may do on the invoice workspace, and what it is told about it. The same rules as for the palette: the actions
// are ones a person has with the mouse and keyboard, they go through the same reducer, and the composer never saves.
//
// Three things are kept out of the composer's hands on purpose. It never works out an amount (the app does all sums, in code), it
// never sets a price the founder did not give (the app checks the figure is in what the founder wrote), and it is never sent the
// founder's bank details, address, email or phone, nor a client's: it is sent only what the task needs.

const sentence = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) => z.string().trim().max(max).optional()

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date such as 2026-10-18')
  .describe('A date as YYYY-MM-DD, such as 2026-10-18.')

const line = z.number().int().min(1).max(100).describe('The line\'s number on the invoice, counting from 1 in the order shown.')

const price = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .describe('The price of one, written exactly as the founder wrote it, such as "450" or "R 450,50". Leave it out unless the founder gave this figure. Never work one out.')

const quantity = z.number().min(0.01).max(1_000_000).describe('How many, as the founder said. Leave it out if they did not say.')

export const TERMS_IDS = ['on_receipt', '7', '14', '30', 'custom'] as const

export const invoiceActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.enum(['set_client']),
    name: optionalText(80),
    contact: optionalText(80),
    address: optionalText(300),
    email: optionalText(120),
    vatNumber: optionalText(30),
    reference: optionalText(60).describe('The client\'s own reference, such as a purchase order number.'),
  }),
  z.object({ type: z.enum(['use_saved_client']), name: sentence(80).describe('The name of a client listed in savedClients. Their details are filled in for the founder.') }),
  z.object({
    type: z.enum(['set_terms']),
    terms: z.enum(TERMS_IDS).describe('When payment is due: on_receipt, 7, 14 or 30 days after the invoice date, or custom with a date.'),
    customDueDate: isoDate.optional().describe('The due date, only when terms is custom.'),
  }),
  z.object({ type: z.enum(['set_date']), date: isoDate }),
  z.object({ type: z.enum(['set_note']), note: z.string().trim().max(1000).describe('The note at the foot of the invoice. An empty string clears it.') }),
  z.object({ type: z.enum(['set_vat_registered']), registered: z.boolean().describe('True only if the founder said they are registered for VAT.') }),
  z.object({
    type: z.enum(['add_line']),
    description: sentence(200),
    quantity: quantity.optional(),
    unitPrice: price.optional(),
  }),
  z.object({
    type: z.enum(['update_line']),
    line,
    description: sentence(200).optional(),
    quantity: quantity.optional(),
    unitPrice: price.optional(),
  }),
  z.object({ type: z.enum(['remove_line']), line }),
  z.object({ type: z.enum(['undo']) }),
  z.object({ type: z.enum(['redo']) }),
])

export type InvoiceTurnAction = z.infer<typeof invoiceActionSchema>

export const MAX_INVOICE_ACTIONS = 20

export const invoiceTurnSchema = z.object({
  task: z.enum(TASKS).describe('The task the request belongs to, or chat for ordinary conversation.'),
  message: sentence(700).describe('What you say to the founder: an answer, advice, or what you did and why. First person, plain.'),
  actions: z.array(invoiceActionSchema).max(MAX_INVOICE_ACTIONS).describe('What to do on the invoice. Empty when the founder only wants an answer.'),
  memoryUsed: z.array(z.string().max(60)).max(6).describe('Which saved decisions you used, by key, such as client.name.'),
})

export type InvoiceTurn = z.infer<typeof invoiceTurnSchema>

// What the composer is told about the invoice on screen. The figures are the app's own, and the private details are only whether
// they are filled in.
export const invoiceSnapshotSchema = z.object({
  today: isoDate,
  kind: z.enum(['invoice', 'quote']),
  number: z.string().max(40),
  issueDate: z.string().max(10),
  terms: z.enum(TERMS_IDS),
  customDueDate: z.string().max(10),
  // When payment is due, worked out in code, or empty if it cannot be.
  dueDate: z.string().max(10),
  notes: z.string().max(1000),
  vatRegistered: z.boolean(),
  business: z.object({
    name: z.string().max(80),
    hasAddress: z.boolean(),
    hasContact: z.boolean(),
    hasBankDetails: z.boolean(),
  }),
  client: z.object({ name: z.string().max(80), hasAddress: z.boolean() }),
  // The names of the clients the project remembers, so a repeat client can be picked.
  savedClients: z.array(z.string().max(80)).max(50),
  lines: z
    .array(z.object({ description: z.string().max(200), quantity: z.number().finite().min(0).max(1_000_000), unitCents: z.number().int().min(0).nullable() }))
    .min(1)
    .max(100),
  // What still stands in the way of exporting, in the app's own words.
  needs: z.array(z.string().max(200)).max(20),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
})
export type InvoiceSnapshot = z.infer<typeof invoiceSnapshotSchema>
