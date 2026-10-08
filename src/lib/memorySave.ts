import { z } from 'zod'
import { FACT_KEYS, MAX_FACT_LENGTH } from './facts.ts'
import { businessSchema, clientSchema, invoiceContentSchema } from './invoiceSave.ts'

// What a project remembers: the things the founder confirmed, so they are never typed twice. Nothing gets in here unless the
// founder confirmed it, and everything read back is validated, because storage can hold anything.
const id = z.string().min(1).max(60)

// A fact about the business that the founder confirmed: its current words, when, and the chat it came from; and the words it had before, kept so a
// change can be seen and taken back.
const factSchema = z.object({
  value: z.string().min(1).max(MAX_FACT_LENGTH),
  confirmedAt: z.string(),
  chatId: z.string().max(80).optional(),
  earlier: z.array(z.object({ value: z.string().min(1).max(MAX_FACT_LENGTH), replacedAt: z.string() })).max(5),
})
export type StoredFact = z.infer<typeof factSchema>

export const memorySchema = z.object({
  // The founder's own business: entered once, and on every invoice.
  business: z.object({ details: businessSchema, confirmedAt: z.string() }).nullable(),
  // What the founder decided on the business-idea board: the name they chose and the offer. Either can be missing. Absent in a memory from
  // before the board, which is still read.
  idea: z
    .object({
      name: z.string().max(80).nullable(),
      offer: z.string().max(300).nullable(),
      confirmedAt: z.string(),
    })
    .optional(),
  // Facts about the business, by key. The name and the offer are also kept as `idea` (the board sets them), and `idea` is what they are read from.
  facts: z.partialRecord(z.enum(FACT_KEYS), factSchema).optional(),
  // What the founder switched off for this project. Both are on unless they say so.
  settings: z.object({ recall: z.boolean().optional(), notes: z.boolean().optional() }).optional(),
  // Clients, so a repeat client is picked and not retyped.
  clients: z.array(z.object({ id, client: clientSchema, confirmedAt: z.string() })).max(200),
  // Invoices, each kept as the founder last confirmed it. The number belongs to the invoice, so a revision keeps it.
  invoices: z
    .array(
      z.object({
        id,
        content: invoiceContentSchema,
        // How many times it has been confirmed. The first is 1.
        revision: z.number().int().min(1),
        updatedAt: z.string(),
        // When it was last exported as a PDF, if it has been.
        exportedAt: z.string().optional(),
      }),
    )
    .max(500),
})

export type ProjectMemory = z.infer<typeof memorySchema>
export type SavedClient = ProjectMemory['clients'][number]
export type SavedInvoice = ProjectMemory['invoices'][number]
