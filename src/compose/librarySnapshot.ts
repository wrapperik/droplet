import { z } from 'zod'
import type { InvoiceItem, IdeasItem, Library } from '../lib/library.ts'

// What the composer is told about the library: counts, names and where each thing stands, so it can open or export one when the founder asks. No
// amount, no address, no contact or bank detail, and none of what the founder wrote in a document.
export const librarySnapshotSchema = z.object({
  // A palette is saved.
  brand: z.boolean(),
  // A board with something on it is saved.
  ideas: z.object({ notes: z.number().int().min(0).max(1000), frames: z.number().int().min(0).max(1000) }).nullable(),
  // The saved invoices, newest first.
  invoices: z
    .array(
      z.object({
        number: z.string().max(40),
        client: z.string().max(80),
        status: z.string().max(40),
        // Nothing required is missing, so it can be exported.
        ready: z.boolean(),
      }),
    )
    .max(12),
})
export type LibrarySnapshot = z.infer<typeof librarySnapshotSchema>

export function snapshotOfLibrary(library: Library): LibrarySnapshot {
  const ideas = library.items.find((item): item is IdeasItem => item.section === 'ideas')
  const invoices = library.items.filter((item): item is InvoiceItem => item.section === 'invoices')
  return {
    brand: library.items.some((item) => item.section === 'brand'),
    ideas: ideas ? { notes: Math.min(ideas.notes, 1000), frames: Math.min(ideas.frames, 1000) } : null,
    invoices: invoices.slice(0, 12).map((invoice) => ({ number: invoice.number.slice(0, 40), client: invoice.client.slice(0, 80), status: invoice.statusLabel.slice(0, 40), ready: invoice.ready })),
  }
}

// The words the composer reads, in the app's own terms.
export function describeLibrary(snapshot: LibrarySnapshot): Record<string, unknown> {
  return {
    palette: snapshot.brand ? 'saved' : 'none saved',
    board: snapshot.ideas ? `saved, ${snapshot.ideas.notes} notes and ${snapshot.ideas.frames} frames` : 'none saved',
    invoices: snapshot.invoices.length === 0 ? 'none saved' : snapshot.invoices.map((invoice) => `${invoice.number || '(no number)'}${invoice.client ? ` for ${invoice.client}` : ''}: ${invoice.status}${invoice.ready ? '' : ', not ready to export'}`),
  }
}
