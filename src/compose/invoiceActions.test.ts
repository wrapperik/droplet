import { describe, expect, it } from 'vitest'
import { emptyClient, newContent } from '../lib/invoice.ts'
import { formatRand } from '../lib/money.ts'
import { invoiceDocOf, openInvoiceWorkspace, reduceInvoice, type InvoiceState } from '../lib/invoiceState.ts'
import { amountsIn, applyInvoiceTurnActions, priceWasGiven, type KnownClient } from './invoiceActions.ts'
import type { InvoiceTurnAction } from './invoiceSpec.ts'

const fresh = () => openInvoiceWorkspace(newContent('2026-10-04', 'INV-0007'), 'i1')
const saved: KnownClient[] = [{ name: 'Pretoria Print Works', client: { ...emptyClient(), name: 'Pretoria Print Works', address: '5 Church Square' } }]
const apply = (actions: InvoiceTurnAction[], founder = ['x'], base: InvoiceState = fresh()) => applyInvoiceTurnActions({ base, actions, clients: saved, founderText: founder })
const content = (state: InvoiceState) => invoiceDocOf(state).content
const reasons = (actions: InvoiceTurnAction[], founder?: string[], base?: InvoiceState) => apply(actions, founder, base).skipped.map((skipped) => skipped.reason)

describe('amountsIn', () => {
  it('finds every amount in what was written, however it was written', () => {
    const found = amountsIn('12 boxes at R450 each, delivery 250,50 and a deposit of R 1 200 (or 1,234.50)')
    for (const cents of [45000, 25050, 120000, 123450, 1200]) expect(found.has(cents)).toBe(true)
    expect(found.has(99999)).toBe(false)
  })

  it('finds nothing in words with no figures in them', () => {
    expect(amountsIn('a dozen boxes at four hundred and fifty').size).toBe(0)
    expect(amountsIn('').size).toBe(0)
  })

  it('knows whether a price was given', () => {
    expect(priceWasGiven(45000, ['Invoice them for boxes at R450'])).toBe(true)
    expect(priceWasGiven(45000, ['nothing here', 'earlier I said 450.00'])).toBe(true)
    expect(priceWasGiven(45000, ['Invoice them for 12 boxes'])).toBe(false)
    expect(priceWasGiven(5400, ['12 boxes at R450'])).toBe(false)
  })
})

describe('lines and prices', () => {
  it('adds a line with a quantity and a price the founder gave, into the blank line there already is', () => {
    const result = apply([{ type: 'add_line', description: 'Gift box, small', quantity: 12, unitPrice: 'R450' }], ['12 small gift boxes at R450 each'])
    expect(result.skipped).toEqual([])
    expect(content(result.state).lines).toEqual([{ id: 1, description: 'Gift box, small', quantity: 12, unitCents: 45000 }])
  })

  it('adds the next lines after it, with new numbers', () => {
    const result = apply(
      [
        { type: 'add_line', description: 'Gift box', quantity: 12, unitPrice: '450' },
        { type: 'add_line', description: 'Delivery', unitPrice: '250' },
      ],
      ['boxes 450 and delivery 250'],
    )
    expect(result.skipped).toEqual([])
    expect(content(result.state).lines).toEqual([
      { id: 1, description: 'Gift box', quantity: 12, unitCents: 45000 },
      { id: 2, description: 'Delivery', quantity: 1, unitCents: 25000 },
    ])
  })

  it('adds a line with no price when none was given, which is then marked as needing one', () => {
    const result = apply([{ type: 'add_line', description: 'Printed insert', quantity: 12 }], ['add 12 printed inserts'])
    expect(result.skipped).toEqual([])
    expect(content(result.state).lines[0]).toEqual({ id: 1, description: 'Printed insert', quantity: 12, unitCents: null })
  })

  it('refuses a price the founder did not write, and says to leave it out, but does nothing else wrong', () => {
    const result = apply(
      [
        { type: 'add_line', description: 'Gift box', quantity: 12, unitPrice: '450' },
        { type: 'set_terms', terms: '7' },
      ],
      ['12 gift boxes, due in 7 days'],
    )
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].position).toBe(0)
    expect(result.skipped[0].reason).toMatch(/not in what the founder wrote/)
    expect(result.skipped[0].reason).toMatch(/never work one out or guess one/)
    expect(content(result.state).lines[0].unitCents).toBeNull()
    expect(content(result.state).details.terms).toBe('7')
  })

  it('does not accept a price worked out from a total', () => {
    expect(reasons([{ type: 'add_line', description: 'Boxes', quantity: 12, unitPrice: '450' }], ['12 boxes for R5400 in all'])[0]).toMatch(/not in what the founder wrote/)
  })

  it('takes a price the founder gave earlier in the conversation', () => {
    expect(reasons([{ type: 'add_line', description: 'Delivery', unitPrice: 'R250' }], ['now add delivery', 'delivery is R250'])).toEqual([])
  })

  it('refuses something that is not a price, and a quantity that is not one', () => {
    expect(reasons([{ type: 'add_line', description: 'x', unitPrice: 'cheap' }])[0]).toMatch(/not a price/)
    expect(reasons([{ type: 'add_line', description: 'x', quantity: 1.234 }])[0]).toMatch(/at most two decimals/)
  })

  it('updates a line by its number, leaving what was not asked about', () => {
    const base = apply([{ type: 'add_line', description: 'Gift box', quantity: 12, unitPrice: '450' }], ['450']).state
    const result = apply([{ type: 'update_line', line: 1, quantity: 24 }], ['make it 24'], base)
    expect(content(result.state).lines[0]).toEqual({ id: 1, description: 'Gift box', quantity: 24, unitCents: 45000 })
    expect(reasons([{ type: 'update_line', line: 1, unitPrice: '500' }], ['make it 24'], base)[0]).toMatch(/not in what the founder wrote/)
    expect(content(apply([{ type: 'update_line', line: 1, unitPrice: '500' }], ['change it to R500'], base).state).lines[0].unitCents).toBe(50000)
  })

  it('says which lines there are when one does not exist, and when an update changes nothing', () => {
    expect(reasons([{ type: 'update_line', line: 3, quantity: 2 }])[0]).toBe('There is no line 3. The invoice has 1 line, numbered 1 to 1.')
    expect(reasons([{ type: 'remove_line', line: 2 }])[0]).toMatch(/There is no line 2/)
    expect(reasons([{ type: 'update_line', line: 1 }])[0]).toMatch(/needs something to change/)
  })

  it('removes a line by its number', () => {
    const base = apply([{ type: 'add_line', description: 'A' }, { type: 'add_line', description: 'B' }], ['x']).state
    expect(content(apply([{ type: 'remove_line', line: 1 }], ['x'], base).state).lines.map((line) => line.description)).toEqual(['B'])
  })

  it('works out the lines for a later action in the same turn from the earlier ones', () => {
    const result = apply([{ type: 'add_line', description: 'A' }, { type: 'add_line', description: 'B' }, { type: 'remove_line', line: 2 }], ['x'])
    expect(result.skipped).toEqual([])
    expect(content(result.state).lines.map((line) => line.description)).toEqual(['A'])
  })
})

describe('the client', () => {
  it('uses a saved client by name, ignoring capitals, and brings their details with them', () => {
    const result = apply([{ type: 'use_saved_client', name: 'pretoria print works' }])
    expect(result.skipped).toEqual([])
    expect(content(result.state).client).toMatchObject({ name: 'Pretoria Print Works', address: '5 Church Square' })
  })

  it('names the saved clients when one is not saved, and says to set a new one', () => {
    const [reason] = reasons([{ type: 'use_saved_client', name: 'Someone' }])
    expect(reason).toMatch(/The saved clients are: Pretoria Print Works/)
    expect(reason).toMatch(/set_client/)
    expect(applyInvoiceTurnActions({ base: fresh(), actions: [{ type: 'use_saved_client', name: 'A' }], clients: [], founderText: [] }).skipped[0].reason).toMatch(/No clients are saved/)
  })

  it('knows a saved client by name alone, as the server does', () => {
    const result = applyInvoiceTurnActions({ base: fresh(), actions: [{ type: 'use_saved_client', name: 'Pretoria Print Works' }], clients: [{ name: 'Pretoria Print Works' }], founderText: [] })
    expect(content(result.state).client.name).toBe('Pretoria Print Works')
  })

  it('sets only the details it is given for a new client', () => {
    const result = apply([{ type: 'set_client', name: 'Karoo Candles', contact: 'Thandi' }])
    expect(content(result.state).client).toEqual({ ...emptyClient(), name: 'Karoo Candles', contact: 'Thandi' })
    expect(reasons([{ type: 'set_client' }])[0]).toMatch(/at least one detail/)
  })
})

describe('terms, dates, notes and VAT', () => {
  it('sets the terms, and a custom due date only when it is a real date', () => {
    expect(content(apply([{ type: 'set_terms', terms: '30' }]).state).details.terms).toBe('30')
    expect(content(apply([{ type: 'set_terms', terms: 'custom', customDueDate: '2026-12-01' }]).state).details).toMatchObject({ terms: 'custom', customDueDate: '2026-12-01' })
    expect(reasons([{ type: 'set_terms', terms: 'custom' }])[0]).toMatch(/real due date/)
    expect(reasons([{ type: 'set_terms', terms: 'custom', customDueDate: '2026-02-30' }])[0]).toMatch(/real due date/)
  })

  it('sets the date of the invoice when it is a real date, and a note, and VAT', () => {
    expect(content(apply([{ type: 'set_date', date: '2026-10-10' }]).state).details.issueDate).toBe('2026-10-10')
    expect(reasons([{ type: 'set_date', date: '2026-13-10' }])[0]).toMatch(/not a real date/)
    expect(content(apply([{ type: 'set_note', note: 'Thank you.' }]).state).details.notes).toBe('Thank you.')
    expect(content(apply([{ type: 'set_vat_registered', registered: true }]).state).vatRegistered).toBe(true)
  })
})

describe('the whole turn', () => {
  it('is one step in the history, so one undo takes back everything the composer did', () => {
    const result = apply([{ type: 'use_saved_client', name: 'Pretoria Print Works' }, { type: 'add_line', description: 'Box', unitPrice: '450' }, { type: 'set_terms', terms: '7' }], ['450'])
    expect(result.state.history.past).toHaveLength(1)
    const undone = reduceInvoice(result.state, { type: 'undo' })
    expect(content(undone)).toEqual(content(fresh()))
  })

  it('changes nothing when nothing could be done', () => {
    const base = fresh()
    const result = apply([{ type: 'remove_line', line: 9 }], ['x'], base)
    expect(result.state).toBe(base)
  })

  it('undoes and redoes on their own, and refuses when there is nothing to do or it is mixed with others', () => {
    const changed = apply([{ type: 'set_terms', terms: '7' }]).state
    expect(content(apply([{ type: 'undo' }], ['x'], changed).state).details.terms).toBe('14')
    expect(reasons([{ type: 'undo' }])[0]).toMatch(/nothing to undo/)
    expect(reasons([{ type: 'redo' }])[0]).toMatch(/nothing to redo/)
    expect(reasons([{ type: 'set_terms', terms: '30' }, { type: 'undo' }], ['x'], changed)[0]).toMatch(/on their own/)
  })
})

describe('the changes it reports, for the receipt', () => {
  const texts = (actions: InvoiceTurnAction[], founder?: string[], base?: InvoiceState) => apply(actions, founder, base).changes.map((change) => change.text)

  it('says a client was set by naming what was set, and never shows a detail of theirs', () => {
    const result = apply([{ type: 'set_client', name: 'Karoo Candles', address: '12 Long Street', email: 'a@b.co' }])
    expect(result.changes.map((change) => change.text)).toEqual(['Client: set the name (“Karoo Candles”), the address, the email'])
    expect(JSON.stringify(result.changes)).not.toMatch(/Long Street|a@b\.co/)
    expect(texts([{ type: 'use_saved_client', name: 'pretoria print works' }])).toEqual(['Used the saved client “pretoria print works”'])
  })

  it('says the terms, the date, the note and VAT', () => {
    expect(texts([{ type: 'set_terms', terms: '30' }])).toEqual(['Payment terms set to 30 days'])
    expect(texts([{ type: 'set_terms', terms: 'on_receipt' }])).toEqual(['Payment terms set to due on receipt'])
    expect(texts([{ type: 'set_terms', terms: 'custom', customDueDate: '2026-11-01' }])).toEqual(['Payment terms set to due on 2026-11-01'])
    expect(texts([{ type: 'set_date', date: '2026-10-06' }])).toEqual(['Invoice date set to 2026-10-06'])
    expect(texts([{ type: 'set_note', note: 'Thank you' }])).toEqual(['Set the note on the invoice'])
    expect(texts([{ type: 'set_note', note: ' ' }])).toEqual(['Cleared the note'])
    expect(texts([{ type: 'set_vat_registered', registered: true }])).toEqual(['Turned VAT on: the business is registered for it'])
  })

  it('numbers an added line as it is on the invoice, with the quantity and the price the founder gave, and says when there is none', () => {
    const result = apply(
      [
        { type: 'add_line', description: 'Gift box, small', quantity: 12, unitPrice: 'R450' },
        { type: 'add_line', description: 'Delivery' },
      ],
      ['12 small gift boxes at R450 each, and delivery'],
    )
    expect(result.changes.map((change) => change.text)).toEqual([`Line 1: Gift box, small \u00d7 12, ${formatRand(45000)} each`, 'Line 2: Delivery, no price yet'])
    expect(result.changes.every((change) => change.kind === 'added')).toBe(true)
    expect(result.changes[0].focus).toEqual([{ kind: 'line', id: 1, how: 'added' }])
  })

  it('says a line changed, and what was changed in it, and a removed line with what it was', () => {
    const base = apply([{ type: 'add_line', description: 'Delivery' }, { type: 'add_line', description: 'Box', quantity: 2 }], ['x']).state
    expect(texts([{ type: 'update_line', line: 1, unitPrice: '250' }], ['delivery is 250'], base)).toEqual([`Line 1: price set to ${formatRand(25000)}`])
    expect(texts([{ type: 'update_line', line: 2, description: 'Big box', quantity: 3 }], ['x'], base)).toEqual(['Line 2: description, quantity changed'])
    const removed = apply([{ type: 'remove_line', line: 1 }], ['x'], base)
    expect(removed.changes).toEqual([{ kind: 'removed', text: 'Line 1 removed: Delivery', focus: [{ kind: 'line', id: 1, how: 'removed' }] }])
  })

  it('reports nothing for what was refused, and the turn that undoes as taking back', () => {
    expect(apply([{ type: 'add_line', description: 'Box', unitPrice: '450' }], ['no price here']).changes).toEqual([])
    const done = apply([{ type: 'set_terms', terms: '7' }]).state
    expect(texts([{ type: 'undo' }], ['x'], done)).toEqual(['Took back the last change'])
  })
})
