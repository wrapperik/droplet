import { chatTurn, openSnapshot, validOpenTurn } from './fixtures.ts'
import { checkConversation, checkTurn, checkTurnFor } from './rules.ts'
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

describe('checkConversation', () => {
  const asked = { intent: 'x' }
  const talk = (extra: Partial<Turn>): Turn => ({ ...chatTurn, ...extra })

  it('passes a reply with no question, and one with a question and replies', () => {
    expect(checkConversation(chatTurn, asked)).toEqual([])
    expect(checkConversation(talk({ question: 'Do you know your costs?', replies: ['Yes', 'Not sure yet'] }), asked)).toEqual([])
  })

  it('needs a question to end with a question mark', () => {
    expect(checkConversation(talk({ question: 'Tell me your costs.' }), asked)[0]).toMatch(/question mark/)
  })

  it('gives replies only with a question, and each one different', () => {
    expect(checkConversation(talk({ replies: ['Yes', 'No'] }), asked)[0]).toMatch(/only with a question/)
    expect(checkConversation(talk({ question: 'Warmer?', replies: ['Yes', 'yes'] }), asked)[0]).toMatch(/different/)
  })

  it('never lets an invoice reply suggest a price, but allows a figure the founder wrote', () => {
    const turn = talk({ task: 'invoice', question: 'What do you charge for delivery?', replies: ['R250', 'I will add it'] })
    expect(checkConversation(turn, { intent: 'bill them for boxes', view: 'invoice' })[0]).toMatch(/never suggest a price/)
    expect(checkConversation(turn, { intent: 'delivery is R250', view: 'invoice' })).toEqual([])
    // figures that are not money, such as days, are fine
    expect(checkConversation(talk({ task: 'invoice', question: 'How long to pay?', replies: ['14 days', '30 days'] }), { intent: 'x', view: 'invoice' })).toEqual([])
    // and off the invoice a figure in a reply is only an answer
    expect(checkConversation(talk({ question: 'What is your budget?', replies: ['Under R500', 'Over R500'] }), asked)).toEqual([])
  })

  it('is part of the check a reply must pass, with the reason written to send back', () => {
    const errors = checkTurnFor(talk({ question: 'Say more.' }), { intent: 'hi' })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^question:/)
  })
})
