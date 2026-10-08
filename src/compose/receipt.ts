import { z } from 'zod'

// The change receipt: what a reply really did, built in code from the actions the appliers applied, never from the model's words. The apply
// functions return a `Change` for each thing they did, in the order they did it, and a `Skipped` for each thing they left out and why. This
// module turns them into the card under the reply: a heading, one line per change and one per thing left out.
//
// A change also says which things on screen it touched (`focus`), so "Show me" can bring them into view and the arrival can play on each.

// Where a thing is on screen: a colour on the palette, a line of the invoice, an item of the board, or a whole window.
export type FocusTarget = { kind: 'block' | 'line' | 'item' | 'window'; id: string | number; how: 'added' | 'changed' | 'moved' | 'removed' }

export type Change = {
  // A thing was added or taken away, or something about it changed. Only an addition and a removal are marked with a sign.
  kind: 'added' | 'removed' | 'changed'
  text: string
  focus: FocusTarget[]
}

export type ReceiptWorkspace = 'brand' | 'invoice' | 'board'

// What the card shows, and what is kept with the message in the saved chat. The ability to undo is not kept: after a reload the lines are all that
// is left.
export const MAX_RECEIPT_LINES = 30

export const receiptSchema = z.object({
  heading: z.string().max(80),
  lines: z.array(z.object({ mark: z.enum(['+', '-', '']), text: z.string().max(240) })).max(MAX_RECEIPT_LINES),
  left: z.array(z.string().max(300)).max(10),
  // How "Undo this" ended, if it was pressed.
  status: z.string().max(200).optional(),
})
export type Receipt = z.infer<typeof receiptSchema>

const PLACES: Record<ReceiptWorkspace, string> = { brand: 'palette', invoice: 'invoice', board: 'board' }

export const markOf = (kind: Change['kind']): '+' | '-' | '' => (kind === 'added' ? '+' : kind === 'removed' ? '-' : '')

export const plural = (count: number, one: string, many: string = `${one}s`) => `${count} ${count === 1 ? one : many}`

// What an action is called when it was left out, so the reason has something to hang on. The reasons are written for the model, and are shown as they are.
const ACTION_WORDS: Record<string, string> = {
  set_palette: 'The new palette',
  set_colour: 'Changing a colour',
  add_colour: 'Adding a colour',
  remove_colour: 'Removing a colour',
  set_role: 'Setting a role',
  keep_colour: 'Keeping a colour',
  select_colour: 'Selecting a colour',
  generate: 'Generate',
  show_component: 'Showing a component',
  hide_component: 'Hiding a component',
  move_component: 'Moving a component',
  resize_component: 'Resizing a component',
  expand_tool: 'Making a tool a window',
  collapse_tool: 'Putting a tool back',
  reset_layout: 'Resetting the layout',
  export_brand_sheet: 'The brand sheet',
  set_client: 'Setting the client',
  use_saved_client: 'Using a saved client',
  set_terms: 'Setting the terms',
  set_date: 'Setting the date',
  set_note: 'Setting the note',
  set_vat_registered: 'Changing VAT',
  add_line: 'Adding a line',
  update_line: 'Changing a line',
  remove_line: 'Removing a line',
  add_note: 'Adding a note',
  fill_prompt: 'Filling in a prompt',
  cluster: 'Grouping notes',
  add_template: 'Adding a template',
  connect: 'Drawing an arrow',
  undo: 'Undo',
  redo: 'Redo',
}

export const leftOutLine = (action: { type: string }, reason: string): string => `${ACTION_WORDS[action.type] ?? 'One thing'}: ${reason}`

// The card for a reply, or null when there is nothing to show: nothing changed and nothing was left out.
export function buildReceipt(workspace: ReceiptWorkspace, changes: Change[], skipped: { action: { type: string }; reason: string }[]): Receipt | null {
  if (changes.length === 0 && skipped.length === 0) return null
  return {
    heading: changes.length > 0 ? `Changed on the ${PLACES[workspace]}` : `Nothing changed on the ${PLACES[workspace]}`,
    lines: changes.slice(0, MAX_RECEIPT_LINES).map((change) => ({ mark: markOf(change.kind), text: change.text })),
    left: skipped.slice(0, 10).map((item) => leftOutLine(item.action, item.reason)),
  }
}

// Everything the changes touched, in order, once each, for Show me and for the arrival.
export function focusOf(changes: Change[]): FocusTarget[] {
  const seen = new Map<string, FocusTarget>()
  for (const target of changes.flatMap((change) => change.focus)) {
    const key = `${target.kind}:${target.id}`
    // A thing added and then changed in the same reply is still new.
    if (!seen.has(key)) seen.set(key, target)
  }
  return [...seen.values()]
}
