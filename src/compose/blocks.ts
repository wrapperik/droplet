import { z } from 'zod'
import { checkBriefWords } from '../lib/logoHandoff.ts'
import { JOURNEY_STEPS } from './journey.ts'

// What Droplet can show in the chat besides words: a table, a checklist, a logo brief, or a draft the founder will send. They are data, drawn by the interface's own components, never
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

// A brief for a logo made in another tool. The model writes only the words: what the business does, the feel, and where the logo will be used. The
// colours are the saved palette's and the files to ask for are the app's, both added when it is drawn, so no hex code or size is the model's.
export const briefBlockSchema = z.object({
  type: z.enum(['brief']),
  does: z.string().trim().min(1).max(160).describe('What the business does and who for, in one short sentence, in the founder\'s words. No hex codes.'),
  feel: z.array(z.string().trim().min(1).max(24)).min(1).max(3).describe('Up to three words for how the brand should feel, from what the founder said.'),
  usedFor: z.string().trim().min(1).max(120).describe('Where the logo will be used, as the founder said (invoices, social media, a shopfront). No hex codes.'),
  fonts: z.array(z.string().trim().min(1).max(40)).max(2).optional().describe('Up to two font names to suggest, only if the founder has none chosen. The app uses the founder\'s own choice when there is one.'),
})

// Something the founder will send in their own name (an email, a WhatsApp message, a post), written exactly as it should go out, so it can be copied
// and sent as it is: no markers around it, no notes in it, and nothing that says it was written by AI.
export const MAX_DRAFT_CHARS = 1500
export const draftBlockSchema = z.object({
  type: z.enum(['draft']),
  label: z.string().trim().min(1).max(60).optional().describe('What it is and who for, a few words, such as "WhatsApp to Tanya".'),
  text: z.string().trim().min(1).max(MAX_DRAFT_CHARS).describe('The message exactly as the founder will send it, signed in their name or the business\'s. Nothing before or after it: no "---", no quotation marks around it, no notes.'),
})

export const blockSchema = z.discriminatedUnion('type', [tableBlockSchema, checklistBlockSchema, briefBlockSchema, draftBlockSchema])

export type TableBlock = z.infer<typeof tableBlockSchema>
export type ChecklistBlock = z.infer<typeof checklistBlockSchema>
export type BriefBlock = z.infer<typeof briefBlockSchema>
export type DraftBlock = z.infer<typeof draftBlockSchema>
export type ChecklistItem = z.infer<typeof checklistItemSchema>
export type ChatBlock = z.infer<typeof blockSchema>

export const blocksField = z
  .array(blockSchema)
  .max(MAX_BLOCKS)
  .optional()
  .describe(
    'Up to two things shown under your message: a table to compare options across two or more things, a checklist (numbered for a plan), a brief for a logo (once you know what the business does, the feel and where the logo will be used), or a draft of something the founder will send (an email, a WhatsApp message, a post), exactly as it should go out. Leave it out when a sentence or a short list in the message will do.',
  )

// Problems with blocks that the shape cannot say, worded to be sent back to the model.
export function checkBlocks(blocks: ChatBlock[] | undefined): string[] {
  const errors: string[] = []
  blocks?.forEach((block, at) => {
    if (block.type === 'table') {
      block.rows.forEach((row, rowAt) => {
        if (row.length !== block.columns.length) errors.push(`blocks.${at}.rows.${rowAt}: it has ${row.length} cells but the table has ${block.columns.length} columns. Each row needs one cell per column.`)
      })
    } else if (block.type === 'draft') {
      errors.push(...checkDraft(block.text).map((error) => `blocks.${at}.text: ${error}`))
    } else if (block.type === 'brief') {
      errors.push(...checkBriefWords({ does: block.does, feel: block.feel, usedFor: block.usedFor }).map((error) => `blocks.${at}.${error}`))
      if (blocks.filter((other) => other.type === 'brief').length > 1) errors.push(`blocks.${at}: one brief in a reply is enough.`)
    } else {
      const steps = block.items.flatMap((item) => (item.step ? [item.step] : []))
      if (new Set(steps).size < steps.length) errors.push(`blocks.${at}.items: each step can be on the list only once.`)
    }
  })
  return errors
}

// What would give a draft away, or would have to be cut out before it was sent.
const SEPARATOR = /^\s*(?:-{3,}|_{3,}|\*{3,}|={3,})\s*$/m
const SAYS_AI = /\b(?:as an ai|ai language model|ai[- ]generated|written by (?:ai|droplet)|generated by)\b/i
const PLACEHOLDER = /\[(?:your|insert|client|name|amount|date|number)[^\]]*\]|\{\{[^}]*\}\}/i
const WRAPPED = /^["“'].*["”']$/s

export function checkDraft(text: string): string[] {
  const errors: string[] = []
  if (SEPARATOR.test(text) || /^\s*-{3,}|-{3,}\s*$/.test(text)) errors.push('it has a line of dashes or another separator in it. The draft is only the message itself, with nothing around it.')
  if (SAYS_AI.test(text)) errors.push('it says it was written by AI. It goes out in the founder\'s name, so leave that out.')
  if (PLACEHOLDER.test(text)) errors.push('it has a placeholder in square brackets. Use what you know, or leave the detail out and say in the message what they could add.')
  if (WRAPPED.test(text.trim())) errors.push('it is wrapped in quotation marks. Give only the message.')
  return errors
}

// A block in words, so the composer can be told what it showed earlier. The ticks the founder made are included.
export function describeBlocks(blocks: ChatBlock[] | undefined, checks: Record<string, boolean> | undefined, done: ReadonlySet<string> = new Set()): string {
  return (blocks ?? [])
    .map((block, at) => {
      if (block.type === 'brief') return `[Logo brief: ${block.does}; feel: ${block.feel.join(', ')}; used for: ${block.usedFor}]`
      if (block.type === 'draft') return `[Draft${block.label ? ` "${block.label}"` : ''}: ${block.text}]`
      if (block.type === 'table') return `[Table${block.title ? ` "${block.title}"` : ''}: ${block.columns.join(' | ')}; ${block.rows.map((row) => row.join(' | ')).join('; ')}]`
      const items = block.items.map((item, itemAt) => {
        const ticked = checks?.[`${at}:${itemAt}`] ?? (item.done === true || (item.step !== undefined && done.has(item.step)))
        return `${block.numbered ? `${itemAt + 1}. ` : '- '}${item.label}${ticked ? ' (done)' : ''}`
      })
      return `[${block.numbered ? 'Plan' : 'Checklist'}${block.title ? ` "${block.title}"` : ''}: ${items.join('; ')}]`
    })
    .join('\n')
}
