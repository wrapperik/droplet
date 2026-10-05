import { z } from 'zod'
import { JOURNEY_STEPS } from './journey.ts'

// What Droplet can show in the chat besides words: a table, or a checklist. They are data, drawn by the interface's own components, never
// markup. A checklist with steps on it is the plan Droplet proposes, and the app ticks the steps it can tell are done.

export const MAX_BLOCKS = 2
export const MAX_TABLE_ROWS = 8
export const MAX_CHECKLIST_ITEMS = 8

const cell = z.string().trim().min(1).max(90)

export const tableBlockSchema = z.object({
  type: z.enum(['table']),
  title: z.string().trim().min(1).max(60).optional().describe('What the table shows, a few words.'),
  columns: z.array(z.string().trim().min(1).max(30)).min(2).max(4).describe('Two to four column headings. The first column names the things being compared.'),
  rows: z.array(z.array(cell).min(2).max(4)).min(1).max(MAX_TABLE_ROWS).describe('Up to eight rows. Each has exactly one short cell per column.'),
})

export const checklistItemSchema = z.object({
  label: z.string().trim().min(1).max(70).describe('The step or thing, a few words.'),
  detail: z.string().trim().min(1).max(140).optional().describe('One short line on why, or what it involves.'),
  step: z.enum(JOURNEY_STEPS).optional().describe('Which step of the founder\'s journey this is, when it is one. The app gives it an Open button when it has a workspace, and ticks it when the project shows it is done.'),
  done: z.boolean().optional().describe('True only if the founder has told you they already have this.'),
})

export const checklistBlockSchema = z.object({
  type: z.enum(['checklist']),
  title: z.string().trim().min(1).max(60).optional().describe('What the list is, a few words.'),
  numbered: z.boolean().optional().describe('True for a plan, where the order matters.'),
  items: z.array(checklistItemSchema).min(2).max(MAX_CHECKLIST_ITEMS),
})

export const blockSchema = z.discriminatedUnion('type', [tableBlockSchema, checklistBlockSchema])

export type TableBlock = z.infer<typeof tableBlockSchema>
export type ChecklistBlock = z.infer<typeof checklistBlockSchema>
export type ChecklistItem = z.infer<typeof checklistItemSchema>
export type ChatBlock = z.infer<typeof blockSchema>

export const blocksField = z
  .array(blockSchema)
  .max(MAX_BLOCKS)
  .optional()
  .describe(
    'Up to two things shown under your message: a table to compare options across two or more things, or a checklist (numbered for a plan). Leave it out when a sentence or a short list in the message will do.',
  )

// Problems with blocks that the shape cannot say, worded to be sent back to the model.
export function checkBlocks(blocks: ChatBlock[] | undefined): string[] {
  const errors: string[] = []
  blocks?.forEach((block, at) => {
    if (block.type === 'table') {
      block.rows.forEach((row, rowAt) => {
        if (row.length !== block.columns.length) errors.push(`blocks.${at}.rows.${rowAt}: it has ${row.length} cells but the table has ${block.columns.length} columns. Each row needs one cell per column.`)
      })
    } else {
      const steps = block.items.flatMap((item) => (item.step ? [item.step] : []))
      if (new Set(steps).size < steps.length) errors.push(`blocks.${at}.items: each step can be on the list only once.`)
    }
  })
  return errors
}

// A block in words, so the composer can be told what it showed earlier. The ticks the founder made are included.
export function describeBlocks(blocks: ChatBlock[] | undefined, checks: Record<string, boolean> | undefined, done: ReadonlySet<string> = new Set()): string {
  return (blocks ?? [])
    .map((block, at) => {
      if (block.type === 'table') return `[Table${block.title ? ` "${block.title}"` : ''}: ${block.columns.join(' | ')}; ${block.rows.map((row) => row.join(' | ')).join('; ')}]`
      const items = block.items.map((item, itemAt) => {
        const ticked = checks?.[`${at}:${itemAt}`] ?? (item.done === true || (item.step !== undefined && done.has(item.step)))
        return `${block.numbered ? `${itemAt + 1}. ` : '- '}${item.label}${ticked ? ' (done)' : ''}`
      })
      return `[${block.numbered ? 'Plan' : 'Checklist'}${block.title ? ` "${block.title}"` : ''}: ${items.join('; ')}]`
    })
    .join('\n')
}
