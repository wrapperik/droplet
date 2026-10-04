import { z } from 'zod'
import { businessSchema, clientSchema, invoiceContentSchema } from './invoiceSave.ts'

// What a project remembers: the things the founder confirmed, so they are never typed twice. Nothing gets in here unless the
// founder confirmed it, and everything read back is validated, because storage can hold anything.
const id = z.string().min(1).max(60)

export const memorySchema = z.object({
  // The founder's own business: entered once, and on every invoice.
  business: z.object({ details: businessSchema, confirmedAt: z.string() }).nullable(),
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
