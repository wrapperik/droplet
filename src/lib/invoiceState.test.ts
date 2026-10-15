import { describe, expect, it } from 'vitest'
import { newContent } from './invoice.ts'
import {
  canRedoInvoice,
  canUndoInvoice,
  invoiceDocOf,
  isInvoiceUnsaved,
  openInvoiceWorkspace,
  reduceInvoice,
  type InvoiceAction,
  type InvoiceState,
} from './invoiceState.ts'
import type { SavedInvoice } from './memorySave.ts'

const fresh = () => openInvoiceWorkspace(newContent('2026-10-04'))
const run = (state: InvoiceState, ...actions: InvoiceAction[]) => actions.reduce(reduceInvoice, state)
const content = (state: InvoiceState) => invoiceDocOf(state).content

describe('opening', () => {
  it('starts with nothing to undo, and no arrangement: the frame is fixed', () => {
    const state = fresh()
    expect(Object.keys(invoiceDocOf(state)).sort()).toEqual(['content', 'invoiceId'])
    expect(canUndoInvoice(state)).toBe(false)
  })

  it('is the invoice it was opened for, which keeps its id, or a new one with an id of its own', () => {
    expect(invoiceDocOf(openInvoiceWorkspace(newContent('2026-10-04'), 'i1')).invoiceId).toBe('i1')
    const a = invoiceDocOf(openInvoiceWorkspace(newContent('2026-10-04'))).invoiceId
    const b = invoiceDocOf(openInvoiceWorkspace(newContent('2026-10-04'))).invoiceId
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThan(8)
  })

  it('keeps the invoice id through every change', () => {
    const state = run(openInvoiceWorkspace(newContent('2026-10-04'), 'i1'), { type: 'set_client', patch: { name: 'X' } }, { type: 'undo' })
    expect(invoiceDocOf(state).invoiceId).toBe('i1')
  })
})

describe('details, business and client', () => {
  it('changes a few fields at once and leaves the rest', () => {
    const state = run(fresh(), { type: 'set_business', patch: { name: 'Kindred Gifting', email: 'hello@kindred.example' } })
    expect(content(state).business).toMatchObject({ name: 'Kindred Gifting', email: 'hello@kindred.example', address: '' })
    expect(content(run(state, { type: 'set_client', patch: { name: 'Pretoria Print Works' } })).client.name).toBe('Pretoria Print Works')
    expect(content(run(state, { type: 'set_details', patch: { number: 'INV-0042', terms: '30' } })).details).toMatchObject({ number: 'INV-0042', terms: '30' })
  })

  it('is no step when nothing changes', () => {
    const state = run(fresh(), { type: 'set_business', patch: { name: 'Kindred' } })
    expect(reduceInvoice(state, { type: 'set_business', patch: { name: 'Kindred' } })).toBe(state)
    expect(reduceInvoice(state, { type: 'set_business', patch: {} })).toBe(state)
    expect(reduceInvoice(state, { type: 'set_vat_registered', value: false })).toBe(state)
  })

  it('turns VAT on and off', () => {
    expect(content(run(fresh(), { type: 'set_vat_registered', value: true })).vatRegistered).toBe(true)
  })

  it('joins quick typing in one field into one undo step, but not typing in two fields', () => {
    const typed = run(
      fresh(),
      { type: 'set_business', patch: { name: 'K' } },
      { type: 'set_business', patch: { name: 'Ki' } },
      { type: 'set_business', patch: { name: 'Kin' } },
    )
    expect(typed.history.past).toHaveLength(1)
    expect(content(run(typed, { type: 'undo' })).business.name).toBe('')
    const two = run(typed, { type: 'set_business', patch: { address: '12 Jacaranda' } })
    expect(two.history.past).toHaveLength(2)
  })
})

describe('line items', () => {
  it('adds a line with a new number, and fills in what is known', () => {
    const state = run(fresh(), { type: 'add_line', line: { description: 'Gift box', quantity: 12, unitCents: 45000 } })
    expect(content(state).lines).toHaveLength(2)
    expect(content(state).lines[1]).toEqual({ id: 2, description: 'Gift box', quantity: 12, unitCents: 45000 })
    expect(content(run(state, { type: 'add_line' })).lines[2]).toEqual({ id: 3, description: '', quantity: 1, unitCents: null })
  })

  it('updates one line and ignores one that is not there', () => {
    const state = run(fresh(), { type: 'update_line', id: 1, patch: { description: 'Gift box', unitCents: 45000, quantity: 2 } })
    expect(content(state).lines[0]).toEqual({ id: 1, description: 'Gift box', quantity: 2, unitCents: 45000 })
    expect(reduceInvoice(state, { type: 'update_line', id: 9, patch: { description: 'x' } })).toBe(state)
    expect(reduceInvoice(state, { type: 'update_line', id: 1, patch: { quantity: 2 } })).toBe(state)
  })

  it('leaves out a quantity or a price that cannot be one, and rounds a quantity to two decimals', () => {
    const state = fresh()
    expect(reduceInvoice(state, { type: 'update_line', id: 1, patch: { quantity: NaN } })).toBe(state)
    expect(reduceInvoice(state, { type: 'update_line', id: 1, patch: { unitCents: 1.5 } })).toBe(state)
    expect(content(run(state, { type: 'update_line', id: 1, patch: { quantity: 1.234 } })).lines[0].quantity).toBe(1.23)
    expect(content(run(state, { type: 'update_line', id: 1, patch: { unitCents: 0 } })).lines[0].unitCents).toBe(0)
  })

  it('removes a line, but clears the last one instead so there is always one to type in', () => {
    let state = run(fresh(), { type: 'add_line', line: { description: 'B' } })
    state = run(state, { type: 'remove_line', id: 1 })
    expect(content(state).lines.map((line) => line.id)).toEqual([2])
    state = run(state, { type: 'remove_line', id: 2 })
    expect(content(state).lines).toEqual([{ id: 2, description: '', quantity: 1, unitCents: null }])
    expect(reduceInvoice(state, { type: 'remove_line', id: 2 })).toBe(state)
    expect(reduceInvoice(state, { type: 'remove_line', id: 9 })).toBe(state)
  })

  it('moves a line up or down, and not past the ends', () => {
    const state = run(fresh(), { type: 'add_line', line: { description: 'B' } }, { type: 'add_line', line: { description: 'C' } })
    expect(content(run(state, { type: 'move_line', id: 3, direction: 'up' })).lines.map((line) => line.id)).toEqual([1, 3, 2])
    expect(content(run(state, { type: 'move_line', id: 1, direction: 'down' })).lines.map((line) => line.id)).toEqual([2, 1, 3])
    expect(reduceInvoice(state, { type: 'move_line', id: 1, direction: 'up' })).toBe(state)
    expect(reduceInvoice(state, { type: 'move_line', id: 3, direction: 'down' })).toBe(state)
  })
})

describe('history', () => {
  it('undoes and redoes, and a batch is one step', () => {
    let state = run(fresh(), {
      type: 'batch',
      actions: [
        { type: 'set_client', patch: { name: 'Pretoria Print Works' } },
        { type: 'add_line', line: { description: 'Gift box', quantity: 12, unitCents: 45000 } },
      ],
    })
    expect(state.history.past).toHaveLength(1)
    state = run(state, { type: 'undo' })
    expect(content(state).client.name).toBe('')
    expect(content(state).lines).toHaveLength(1)
    expect(canRedoInvoice(state)).toBe(true)
    expect(content(run(state, { type: 'redo' })).lines).toHaveLength(2)
  })
})

describe('isInvoiceUnsaved', () => {
  const saved = (content = newContent('2026-10-04')): SavedInvoice => ({ id: 'i1', content, revision: 1, updatedAt: '2026-10-04T10:00' })
  const open = () => openInvoiceWorkspace(newContent('2026-10-04'), 'i1')

  it('is unsaved when the invoice has never been confirmed, and saved when it matches what was', () => {
    expect(isInvoiceUnsaved(invoiceDocOf(open()), undefined)).toBe(true)
    expect(isInvoiceUnsaved(invoiceDocOf(open()), saved())).toBe(false)
  })

  it('notices a change to the invoice', () => {
    expect(isInvoiceUnsaved(invoiceDocOf(run(open(), { type: 'set_client', patch: { name: 'X' } })), saved())).toBe(true)
    expect(isInvoiceUnsaved(invoiceDocOf(run(open(), { type: 'add_line' })), saved())).toBe(true)
  })
})

describe('keeping a line in mind', () => {
  it('stars a line through the same action as any change to a line, and a change to the line keeps the star', () => {
    const starred = run(fresh(), { type: 'update_line', id: 1, patch: { description: 'Gift box' } }, { type: 'update_line', id: 1, patch: { starred: true } })
    expect(invoiceDocOf(starred).content.lines[0]).toMatchObject({ description: 'Gift box', starred: true })
    const edited = run(starred, { type: 'update_line', id: 1, patch: { quantity: 3 } })
    expect(invoiceDocOf(edited).content.lines[0].starred).toBe(true)
    expect(canUndoInvoice(starred)).toBe(true)
  })
})
