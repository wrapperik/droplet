import { z } from 'zod'

// What a saved invoice workspace looks like. Everything read back is validated, because storage can hold anything.
const placementSchema = z.object({
  id: z.string(),
  col: z.number().int().min(-1).max(23),
  row: z.number().int().min(0),
  w: z.number().int().min(1).max(24),
})

const text = (max: number) => z.string().max(max)

export const businessSchema = z.object({
  name: text(80),
  address: text(300),
  email: text(120),
  phone: text(40),
  vatNumber: text(30),
  accountHolder: text(80),
  bankName: text(60),
  accountNumber: text(30),
  branchCode: text(20),
})

export const clientSchema = z.object({
  name: text(80),
  contact: text(80),
  address: text(300),
  email: text(120),
  vatNumber: text(30),
  reference: text(60),
})

export const invoiceContentSchema = z.object({
  details: z.object({
    kind: z.enum(['invoice', 'quote']),
    number: text(40),
    issueDate: text(10),
    terms: z.enum(['on_receipt', '7', '14', '30', 'custom']),
    customDueDate: text(10),
    notes: text(1000),
  }),
  business: businessSchema,
  client: clientSchema,
  lines: z
    .array(
      z.object({
        id: z.number().int().min(1),
        description: text(200),
        quantity: z.number().finite().min(0).max(1_000_000),
        unitCents: z.number().int().min(0).max(1_000_000_000_00).nullable(),
        starred: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(100),
  vatRegistered: z.boolean(),
})

// How the invoice workspace is arranged, kept per project. Older saves also hold the invoice that was being worked on, which is
// still read, so nothing a founder typed before the invoice had a memory is lost.
export const invoiceSaveSchema = z.object({
  content: invoiceContentSchema.optional(),
  layout: z.array(placementSchema),
  tools: z.array(z.string()).optional(),
  expanded: z.array(z.string()).optional(),
  hidden: z.array(z.string()).optional(),
  savedAt: z.string(),
})

export type InvoiceSave = z.infer<typeof invoiceSaveSchema>
