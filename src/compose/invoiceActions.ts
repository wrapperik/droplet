import { isIsoDate, lineIsBlank, quantityIsValid, type Client, type Line } from '../lib/invoice.ts'
import { formatRand, parseMoney } from '../lib/money.ts'
import { canRedoInvoice, canUndoInvoice, invoiceDocOf, reduceInvoice, type InvoiceAction, type InvoiceState } from '../lib/invoiceState.ts'
import type { InvoiceTurnAction } from './invoiceSpec.ts'
import type { Change } from './receipt.ts'

// Turns the model's actions on the invoice into workspace actions and applies them through the same reducer a person's edits use.
// Anything that cannot be done is left out with a plain reason, and the reasons are what goes back to the model if it has to try
// again. A turn is one step in the history, so one Undo takes back everything the model did.
//
// The model never sets a price the founder did not give. A price is accepted only if the same figure is in what the founder wrote,
// which the app checks here, in code, rather than trusting the model to remember the rule.

export type KnownClient = {
  name: string
  // The details that come with the name, where the app has them. The server has only the names.
  client?: Client
}

export type InvoiceSkipped = { position: number; action: InvoiceTurnAction; reason: string }

// Every amount in a piece of text, in cents: "R450", "450,50", "R 1 200" and "1,234.50" are all amounts.
export function amountsIn(text: string): Set<number> {
  const found = new Set<number>()
  for (const match of text.matchAll(/\d[\d\s .,]*/g)) {
    const token = match[0].replace(/[\s .,]+$/, '')
    const candidates = [token, ...token.split(/[\s ]+/)]
    for (const candidate of candidates) {
      const cents = parseMoney(candidate)
      if (cents !== null) found.add(cents)
    }
  }
  return found
}

export const priceWasGiven = (cents: number, founderText: string[]) => founderText.some((text) => amountsIn(text).has(cents))

type Props = {
  base: InvoiceState
  actions: InvoiceTurnAction[]
  // The clients the project remembers.
  clients: KnownClient[]
  // What the founder wrote: their request, and the founder's earlier messages. A price must be in here.
  founderText: string[]
}

// `changes` is what was done, in order, for the change receipt.
export type InvoiceApplyResult = { state: InvoiceState; skipped: InvoiceSkipped[]; changes: Change[] }

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const defined = <T extends Record<string, unknown>>(record: T) => Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as Partial<T>

export function applyInvoiceTurnActions({ base, actions, clients, founderText }: Props): InvoiceApplyResult {
  const skipped: InvoiceSkipped[] = []

  // Undo and redo take back or restore a whole step, so they stand alone.
  const history = actions.find((action) => action.type === 'undo' || action.type === 'redo')
  if (history) {
    const position = actions.indexOf(history)
    const reason =
      actions.length > 1 ? 'Undo and redo cannot be combined with other actions. Send them on their own.'
      : history.type === 'undo' && !canUndoInvoice(base) ? 'There is nothing to undo.'
      : history.type === 'redo' && !canRedoInvoice(base) ? 'There is nothing to redo.'
      : null
    if (reason) return { state: base, skipped: [{ position, action: history, reason }], changes: [] }
    return { state: reduceInvoice(base, { type: history.type }), skipped, changes: [{ kind: 'changed', text: history.type === 'undo' ? 'Took back the last change' : 'Put back the change that was taken back', focus: [] }] }
  }

  let scratch = base
  const collected: InvoiceAction[] = []
  const changes: Change[] = []

  actions.forEach((action, position) => {
    const skip = (reason: string) => void skipped.push({ position, action, reason })
    const { lines } = invoiceDocOf(scratch).content
    const lineMissing = (number: number) => `There is no line ${number}. The invoice has ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}, numbered 1 to ${lines.length}.`

    // A price is accepted only if the founder gave it, and a quantity only if it is a quantity.
    const price = (text: string | undefined): { cents?: number; error?: string } => {
      if (text === undefined) return {}
      const cents = parseMoney(text)
      if (cents === null) return { error: `"${text}" is not a price. Leave the price out unless the founder gave one.` }
      if (!priceWasGiven(cents, founderText)) {
        return { error: `The price ${text} is not in what the founder wrote. Leave the price out: never work one out or guess one. The line will be marked as needing a price.` }
      }
      return { cents }
    }

    let next: InvoiceAction[] = []

    switch (action.type) {
      case 'set_client': {
        const { type: _type, ...fields } = action
        const patch = defined(fields)
        if (Object.keys(patch).length === 0) return skip('set_client needs at least one detail to set.')
        next = [{ type: 'set_client', patch }]
        break
      }
      case 'use_saved_client': {
        const match = clients.find((known) => sameName(known.name, action.name))
        if (!match) {
          return skip(
            `There is no saved client called "${action.name}". ${clients.length === 0 ? 'No clients are saved.' : `The saved clients are: ${clients.map((known) => known.name).join(', ')}.`} Use set_client for a new client.`,
          )
        }
        next = [{ type: 'set_client', patch: match.client ?? { name: match.name } }]
        break
      }
      case 'set_terms': {
        if (action.terms === 'custom') {
          if (!action.customDueDate || !isIsoDate(action.customDueDate)) return skip('Custom terms need a real due date, written YYYY-MM-DD.')
          next = [{ type: 'set_details', patch: { terms: 'custom', customDueDate: action.customDueDate } }]
        } else next = [{ type: 'set_details', patch: { terms: action.terms } }]
        break
      }
      case 'set_date':
        if (!isIsoDate(action.date)) return skip(`"${action.date}" is not a real date. Write it YYYY-MM-DD.`)
        next = [{ type: 'set_details', patch: { issueDate: action.date } }]
        break
      case 'set_note':
        next = [{ type: 'set_details', patch: { notes: action.note } }]
        break
      case 'set_vat_registered':
        next = [{ type: 'set_vat_registered', value: action.registered }]
        break
      case 'add_line': {
        if (action.quantity !== undefined && !quantityIsValid(action.quantity)) return skip('A quantity is more than nothing and has at most two decimals.')
        const given = price(action.unitPrice)
        if (given.error) return skip(given.error)
        const patch = { description: action.description, ...(action.quantity !== undefined ? { quantity: action.quantity } : {}), ...(given.cents !== undefined ? { unitCents: given.cents } : {}) }
        // A blank line is there to be typed in, so the first line goes into it and no blank line is left above the others.
        const blank = lines.find(lineIsBlank)
        if (!blank && lines.length >= 100) return skip('The invoice already has 100 lines, which is the most it can hold.')
        next = [blank ? { type: 'update_line', id: blank.id, patch } : { type: 'add_line', line: patch }]
        break
      }
      case 'update_line': {
        const target = lines[action.line - 1]
        if (!target) return skip(lineMissing(action.line))
        if (action.quantity !== undefined && !quantityIsValid(action.quantity)) return skip('A quantity is more than nothing and has at most two decimals.')
        const given = price(action.unitPrice)
        if (given.error) return skip(given.error)
        const patch = defined({ description: action.description, quantity: action.quantity, unitCents: given.cents })
        if (Object.keys(patch).length === 0) return skip('update_line needs something to change: a description, a quantity or a price.')
        next = [{ type: 'update_line', id: target.id, patch }]
        break
      }
      case 'remove_line': {
        const target = lines[action.line - 1]
        if (!target) return skip(lineMissing(action.line))
        next = [{ type: 'remove_line', id: target.id }]
        break
      }
      case 'undo':
      case 'redo':
        return
    }

    const before = invoiceDocOf(scratch).content
    for (const step of next) scratch = reduceInvoice(scratch, step)
    collected.push(...next)
    const change = describeChange(action, before.lines, invoiceDocOf(scratch).content.lines)
    if (change) changes.push(change)
  })

  return { state: collected.length > 0 ? reduceInvoice(base, { type: 'batch', actions: collected }) : base, skipped, changes }
}

const TERMS_WORDS: Record<string, string> = { on_receipt: 'due on receipt', '7': '7 days', '14': '14 days', '30': '30 days' }
const CLIENT_FIELDS: Record<string, string> = { name: 'the name', contact: 'the contact', address: 'the address', email: 'the email', vatNumber: 'the VAT number', reference: 'the reference' }
const quoted = (text: string) => `\u201c${text.trim().slice(0, 40)}\u201d`

// One line of the receipt for an action that was applied, from the lines before and after it. It names what was set and never shows an address,
// a contact or any detail of the client: only which details were set.
function describeChange(action: InvoiceTurnAction, before: Line[], after: Line[]): Change | null {
  // The fields a change was made in, by what they hold, so Show me finds them in the panel of either mode.
  const fields = (...ids: string[]) => ids.map((id) => ({ kind: 'field' as const, id, how: 'changed' as const }))
  const lineAt = (number: number) => ({ number, line: after[number - 1] })
  switch (action.type) {
    case 'set_client': {
      const parts = Object.entries(action)
        .filter(([key, value]) => key !== 'type' && value !== undefined)
        .map(([key]) => (key === 'name' && action.name ? `the name (${quoted(action.name)})` : (CLIENT_FIELDS[key] ?? key)))
      const keys = Object.keys(action).filter((key) => key !== 'type' && action[key as keyof typeof action] !== undefined && key in CLIENT_FIELDS)
      return { kind: 'changed', text: `Client: set ${parts.join(', ')}`, focus: fields(...keys.map((key) => `client.${key}`)) }
    }
    case 'use_saved_client':
      return { kind: 'changed', text: `Used the saved client ${quoted(action.name)}`, focus: fields('client.name') }
    case 'set_terms':
      return { kind: 'changed', text: `Payment terms set to ${action.terms === 'custom' ? `due on ${action.customDueDate}` : TERMS_WORDS[action.terms] ?? action.terms}`, focus: fields('details.terms', ...(action.terms === 'custom' ? ['details.customDueDate'] : [])) }
    case 'set_date':
      return { kind: 'changed', text: `Invoice date set to ${action.date}`, focus: fields('details.issueDate') }
    case 'set_note':
      return { kind: 'changed', text: action.note.trim() === '' ? 'Cleared the note' : 'Set the note on the invoice', focus: fields('details.notes') }
    case 'set_vat_registered':
      return { kind: 'changed', text: action.registered ? 'Turned VAT on: the business is registered for it' : 'Turned VAT off: the business is not registered for it', focus: fields('vat.registered') }
    case 'add_line': {
      const added = after.find((line) => !before.some((other) => other.id === line.id)) ?? after.find((line, index) => before[index] && before[index].id === line.id && JSON.stringify(before[index]) !== JSON.stringify(line))
      const number = added ? after.indexOf(added) + 1 : after.length
      const price = action.unitPrice !== undefined && added?.unitCents != null ? `, ${formatRand(added.unitCents)} each` : ', no price yet'
      return { kind: 'added', text: `Line ${number}: ${action.description.trim().slice(0, 50)}${action.quantity !== undefined ? ` \u00d7 ${action.quantity}` : ''}${price}`, focus: added ? [{ kind: 'line', id: added.id, how: 'added' }] : [] }
    }
    case 'update_line': {
      const { number, line } = lineAt(action.line)
      const rand = line?.unitCents != null ? formatRand(line.unitCents) : 'the amount given'
      const changed = [action.description !== undefined ? 'description' : null, action.quantity !== undefined ? 'quantity' : null, action.unitPrice !== undefined ? `price (${rand})` : null].filter((part): part is string => part !== null)
      const text = changed.length === 1 && action.unitPrice !== undefined ? `Line ${number}: price set to ${rand}` : `Line ${number}: ${changed.join(', ')} changed`
      return { kind: 'changed', text, focus: line ? [{ kind: 'line', id: line.id, how: 'changed' }] : [] }
    }
    case 'remove_line': {
      const old = before[action.line - 1]
      return { kind: 'removed', text: `Line ${action.line} removed${old?.description.trim() ? `: ${old.description.trim().slice(0, 50)}` : ''}`, focus: old ? [{ kind: 'line', id: old.id, how: 'removed' }] : [] }
    }
    default:
      return null
  }
}
