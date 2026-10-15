import { chatTurn, openSnapshot, validOpenTurn } from './fixtures.ts'
import { allowanceSchema, composeRequestSchema, MAX_INTENT_CHARS, modeOf, turnJsonSchema, turnSchema, workspaceSnapshotSchema } from './spec.ts'

describe('a turn that asks a question', () => {
  const ask = { ...chatTurn, question: 'Do you know what one box costs you?', replies: ['Yes', 'Not sure yet'] }

  it('takes a question and replies, and neither is needed', () => {
    expect(turnSchema.safeParse(ask).success).toBe(true)
    expect(turnSchema.safeParse(chatTurn).success).toBe(true)
  })

  it('holds the question to a sentence and the replies to four short answers', () => {
    expect(turnSchema.safeParse({ ...ask, question: 'x'.repeat(201) }).success).toBe(false)
    expect(turnSchema.safeParse({ ...ask, replies: ['a', 'b', 'c', 'd', 'e'] }).success).toBe(false)
    expect(turnSchema.safeParse({ ...ask, replies: ['x'.repeat(41)] }).success).toBe(false)
    expect(turnSchema.safeParse({ ...ask, replies: [''] }).success).toBe(false)
  })

  it('lets the model write a longer message for a list, but not an essay', () => {
    expect(turnSchema.safeParse({ ...chatTurn, message: 'x'.repeat(1200) }).success).toBe(true)
    expect(turnSchema.safeParse({ ...chatTurn, message: 'x'.repeat(1201) }).success).toBe(false)
  })

  it('takes a title for the chat, which is never needed', () => {
    expect(turnSchema.safeParse({ ...chatTurn, title: 'Pricing gift boxes' }).success).toBe(true)
    expect(turnSchema.safeParse({ ...chatTurn, title: '' }).success).toBe(false)
    // a long one is accepted and shortened by the app, rather than costing a retry
    expect(turnSchema.safeParse({ ...chatTurn, title: 'x'.repeat(100) }).success).toBe(true)
    expect(turnSchema.safeParse({ ...chatTurn, title: 'x'.repeat(101) }).success).toBe(false)
    expect(composeRequestSchema.safeParse({ intent: 'hi', chatTitle: 'Pricing gift boxes' }).success).toBe(true)
  })

  it('is in the schema sent to the model, for the palette and for the invoice', () => {
    for (const view of [undefined, 'invoice'] as const) {
      const properties = (turnJsonSchema(view) as { properties: Record<string, unknown> }).properties
      expect(Object.keys(properties)).toEqual(expect.arrayContaining(['message', 'question', 'replies', 'title']))
      expect((turnJsonSchema(view) as { required: string[] }).required).not.toContain('question')
      expect((turnJsonSchema(view) as { required: string[] }).required).not.toContain('title')
    }
  })
})

describe('turnSchema', () => {
  it('accepts an opening turn and a plain conversation turn', () => {
    expect(turnSchema.safeParse(validOpenTurn).success).toBe(true)
    expect(turnSchema.safeParse(chatTurn).success).toBe(true)
  })

  it('needs a message', () => {
    expect(turnSchema.safeParse({ ...chatTurn, message: '' }).success).toBe(false)
  })

  it('rejects a task that does not exist, and an action that is not in the vocabulary', () => {
    expect(turnSchema.safeParse({ ...chatTurn, task: 'weather' }).success).toBe(false)
    expect(turnSchema.safeParse({ ...chatTurn, actions: [{ type: 'save' }] }).success).toBe(false)
    expect(turnSchema.safeParse({ ...chatTurn, actions: [{ type: 'delete_everything' }] }).success).toBe(false)
  })

  it('has no way to save, because only the founder\'s Save commits to memory', () => {
    expect(JSON.stringify(turnJsonSchema())).not.toMatch(/"save/i)
  })

  it('checks the shape of each action', () => {
    const turn = (action: unknown) => turnSchema.safeParse({ ...chatTurn, task: 'brand', actions: [action] }).success
    expect(turn({ type: 'set_colour', index: 2, hex: '#2B3A55' })).toBe(true)
    expect(turn({ type: 'set_colour', index: 0, hex: '#2B3A55' })).toBe(false)
    expect(turn({ type: 'set_colour', index: 9, hex: '#2B3A55' })).toBe(false)
    expect(turn({ type: 'set_colour', index: 2, hex: 'blue' })).toBe(false)
    expect(turn({ type: 'set_role', index: 1, role: 'none' })).toBe(true)
    expect(turn({ type: 'set_role', index: 1, role: 'headline' })).toBe(false)
    expect(turn({ type: 'move_component', component: 'preview', relativeTo: 'canvas', placement: 'right_of' })).toBe(true)
    expect(turn({ type: 'move_component', component: 'preview', relativeTo: 'canvas', placement: 'diagonally' })).toBe(false)
    expect(turn({ type: 'hide_component', component: 'canvas' })).toBe(false)
    expect(turn({ type: 'resize_component', component: 'canvas', size: 'half' })).toBe(true)
    expect(turn({ type: 'resize_component', component: 'picker', size: 'large' })).toBe(false)
    expect(turn({ type: 'expand_tool', component: 'picker' })).toBe(true)
    expect(turn({ type: 'collapse_tool', component: 'role' })).toBe(true)
    expect(turn({ type: 'expand_tool', component: 'canvas' })).toBe(false)
    expect(turn({ type: 'set_palette', colours: [{ hex: '#000000', name: 'a', rationale: 'b' }], reason: 'x' })).toBe(false)
  })

  it('still limits the counts after the reply, though the model\'s schema does not carry them', () => {
    const many = Array.from({ length: 13 }, () => ({ type: 'select_colour', index: 1 }))
    expect(turnSchema.safeParse({ ...chatTurn, task: 'brand', actions: many }).success).toBe(false)
  })
})

describe('turnJsonSchema', () => {
  const schema = JSON.stringify(turnJsonSchema())

  it('names every task and action the model may use', () => {
    for (const word of ['chat', 'brand', 'logo', 'invoice', 'set_palette', 'set_colour', 'move_component', 'resize_component', 'export_brand_sheet', 'undo']) {
      expect(schema).toContain(`"${word}"`)
    }
  })

  it('leaves out keywords the model API may not support, and uses anyOf for the action choice', () => {
    expect(schema).not.toContain('$schema')
    expect(schema).not.toContain('"pattern"')
    expect(schema).not.toContain('"maxLength"')
    expect(schema).not.toContain('"maxItems"')
    expect(schema).not.toContain('"minItems"')
    expect(schema).not.toContain('oneOf')
    expect(schema).toContain('anyOf')
  })
})

describe('workspaceSnapshotSchema', () => {
  it('accepts a real snapshot, and refuses an invalid colour', () => {
    expect(workspaceSnapshotSchema.safeParse(openSnapshot()).success).toBe(true)
    const bad = { ...openSnapshot(), blocks: [{ id: 1, hex: 'red' }, { id: 2, hex: '#000000' }] }
    expect(workspaceSnapshotSchema.safeParse(bad).success).toBe(false)
  })
})

describe('composeRequestSchema', () => {
  it('needs an intent and limits its length', () => {
    expect(composeRequestSchema.safeParse({ intent: '' }).success).toBe(false)
    expect(composeRequestSchema.safeParse({ intent: 'x'.repeat(MAX_INTENT_CHARS + 1) }).success).toBe(false)
    // long enough to paste in a brief or a few paragraphs of notes
    expect(composeRequestSchema.safeParse({ intent: 'x'.repeat(MAX_INTENT_CHARS) }).success).toBe(true)
    expect(composeRequestSchema.safeParse({ intent: 'x'.repeat(3000) }).success).toBe(true)
    expect(composeRequestSchema.safeParse({ intent: 'a colour palette' }).success).toBe(true)
  })

  it('takes the conversation, the workspace and the saved palette, with limits', () => {
    const history = [{ role: 'founder', text: 'hi' }, { role: 'droplet', text: 'hello' }]
    expect(composeRequestSchema.safeParse({ intent: 'x', history, workspace: openSnapshot() }).success).toBe(true)
    expect(composeRequestSchema.safeParse({ intent: 'x', history: [{ role: 'robot', text: 'hi' }] }).success).toBe(false)
    expect(composeRequestSchema.safeParse({ intent: 'x', history: Array.from({ length: 11 }, () => history[0]) }).success).toBe(false)
    expect(composeRequestSchema.safeParse({ intent: 'x', memory: { colours: [{ hex: '#1F8FE0' }] } }).success).toBe(true)
  })
})

describe('the mode of a request', () => {
  it('is Quick unless it says Advanced, and is nothing else', () => {
    expect(composeRequestSchema.parse({ intent: 'hi' }).mode).toBeUndefined()
    expect(modeOf({})).toBe('base')
    expect(modeOf(composeRequestSchema.parse({ intent: 'hi', mode: 'base' }))).toBe('base')
    expect(modeOf(composeRequestSchema.parse({ intent: 'hi', mode: 'advanced' }))).toBe('advanced')
    expect(composeRequestSchema.safeParse({ intent: 'hi', mode: 'turbo' }).success).toBe(false)
  })

  it('has an allowance that is a count and a time, never anything else', () => {
    expect(allowanceSchema.safeParse({ advancedLeft: 3, advancedLimit: 10, resetsAt: null }).success).toBe(true)
    expect(allowanceSchema.safeParse({ advancedLeft: 3.5, advancedLimit: 10, resetsAt: null }).success).toBe(false)
    expect(allowanceSchema.safeParse({ advancedLeft: -1, advancedLimit: 10, resetsAt: null }).success).toBe(false)
    expect(allowanceSchema.safeParse({ advancedLeft: 3, advancedLimit: 10 }).success).toBe(false)
  })
})
