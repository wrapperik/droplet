import { z } from 'zod'
import { paletteResultSchema, type PaletteResult } from './brandGuide.ts'
import { invoiceResultSchema, type InvoiceResult } from './invoiceGuide.ts'

// What a finished task leaves in the chat as a card: a finished invoice or a finished palette. Kept with the chat, so it is validated on the way back in. A chat saved
// before the palette had a card holds only invoice results, which carry no `kind`, and still read: the palette's result is the one with `kind: 'palette'`.
export const chatResultSchema = z.union([paletteResultSchema, invoiceResultSchema])
export type ChatResult = InvoiceResult | PaletteResult

export const isPaletteResult = (result: ChatResult): result is PaletteResult => 'kind' in result && result.kind === 'palette'

// The words a chat's name is made from when nothing else names it: what was finished.
export const resultTitle = (result: ChatResult): string => (isPaletteResult(result) ? result.title : `${result.title} ${result.number}`.trim())
