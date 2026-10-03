import { chatTurn, openSnapshot, validOpenTurn } from './fixtures.ts'
import { checkTurn } from './rules.ts'
import type { Turn } from './spec.ts'

const brand = (actions: Turn['actions']): Turn => ({ task: 'brand', message: 'Done.', actions, memoryUsed: [] })

describe('checkTurn', () => {
  it('passes a plain conversation, with or without a workspace open', () => {
    expect(checkTurn(chatTurn)).toEqual([])
    expect(checkTurn(chatTurn, openSnapshot())).toEqual([])
  })

  it('passes advice about the workspace that changes nothing', () => {
    expect(checkTurn(brand([]), openSnapshot())).toEqual([])
  })

  it('passes an opening palette when no workspace is open', () => {
    expect(checkTurn(validOpenTurn)).toEqual([])
  })

  it('allows actions only for a brand turn', () => {
    const errors = checkTurn({ ...brand([{ type: 'select_colour', index: 1 }]), task: 'invoice' }, openSnapshot())
    expect(errors[0]).toMatch(/Only a brand task may include actions/)
    expect(errors[0]).toContain('"invoice"')
  })

  it('tries the actions against the workspace the founder is looking at, and names the action that cannot be done', () => {
    const errors = checkTurn(brand([{ type: 'select_colour', index: 2 }, { type: 'set_colour', index: 9, hex: '#123456' }]), openSnapshot())
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^Action 2 \(set_colour\): There is no colour 9/)
  })

  it('refuses actions on a workspace that is not open, other than opening one', () => {
    expect(checkTurn(brand([{ type: 'set_colour', index: 1, hex: '#123456' }]))[0]).toMatch(/set_palette/)
  })

  it('checks moves against what is drawn', () => {
    const snapshot = openSnapshot()
    const without = { ...snapshot, hidden: ['preview'], layout: snapshot.layout.filter((p) => p.id !== 'preview') }
    expect(checkTurn(brand([{ type: 'move_component', component: 'preview', relativeTo: 'canvas', placement: 'right_of' }]), without)[0]).toMatch(/not on screen/)
    expect(checkTurn(brand([{ type: 'move_component', component: 'preview', relativeTo: 'canvas', placement: 'above' }]), snapshot)).toEqual([])
    // the canvas is full width, so there is no room beside it until it is made narrower
    expect(checkTurn(brand([{ type: 'move_component', component: 'preview', relativeTo: 'canvas', placement: 'right_of' }]), snapshot)[0]).toMatch(/no room/)
  })

  it('refuses undo when there is nothing to undo, and allows it when there is', () => {
    expect(checkTurn(brand([{ type: 'undo' }]), openSnapshot())[0]).toMatch(/nothing to undo/)
    expect(checkTurn(brand([{ type: 'undo' }]), { ...openSnapshot(), canUndo: true })).toEqual([])
  })
})
