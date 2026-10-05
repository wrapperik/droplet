import { ComposeError, checkReply, composeWorkspace, type ModelCaller, type ModelRequest } from './compose.ts'
import { checkTurnFor } from './rules.ts'
import { fallbackTurn, FALLBACK_NOTE } from './fallback.ts'
import { chatTurn, openSnapshot, validOpenReply, validOpenTurn } from './fixtures.ts'

const request = { intent: 'a colour palette for my gift box business' }

// A model that gives the replies it was told to, in order, and remembers what it was asked.
const scripted = (replies: (string | Error)[]) => {
  const calls: ModelRequest[] = []
  const call: ModelCaller = async (modelRequest) => {
    calls.push(modelRequest)
    const next = replies[calls.length - 1]
    if (next instanceof Error) throw next
    return next
  }
  return { call, calls }
}

describe('checkReply', () => {
  it('accepts a valid reply, also inside a code fence, and normalises hex to upper case', () => {
    const lower = JSON.stringify({
      ...validOpenTurn,
      actions: [{ ...validOpenTurn.actions[0], colours: (validOpenTurn.actions[0] as { colours: { hex: string }[] }).colours.map((c) => ({ ...c, hex: c.hex.toLowerCase() })) }],
    })
    const checked = checkReply('```json\n' + lower + '\n```', { intent: 'a palette' })
    expect(checked.errors).toEqual([])
    const action = checked.turn!.actions[0]
    expect(action.type === 'set_palette' && action.colours[0].hex).toBe('#F7EFE6')
  })

  it('accepts an ordinary answer with no actions', () => {
    expect(checkReply(JSON.stringify(chatTurn)).turn?.message).toMatch(/price/)
  })

  it('reports text that is not JSON, and where a reply does not match the schema', () => {
    expect(checkReply('Here is your palette!').errors[0]).toMatch(/not valid JSON/)
    const checked = checkReply(JSON.stringify({ ...chatTurn, message: '' }))
    expect(checked.turn).toBeUndefined()
    expect(checked.errors.some((e) => e.startsWith('message'))).toBe(true)
  })

  it('checks the actions against the workspace it was asked about', () => {
    const turn = JSON.stringify({ task: 'brand', message: 'Done.', memoryUsed: [], actions: [{ type: 'set_colour', index: 8, hex: '#123456' }] })
    expect(checkReply(turn, { view: 'brand', workspace: openSnapshot() }).errors[0]).toMatch(/There is no colour 8/)
  })

  it('keeps the task it saw even when the reply is unusable', () => {
    expect(checkReply(JSON.stringify({ task: 'invoice' })).task).toBe('invoice')
  })
})

describe('composeWorkspace', () => {
  it('returns a valid first answer after one call', async () => {
    const { call, calls } = scripted([validOpenReply])
    const result = await composeWorkspace(request, call)
    expect(result.outcome).toBe('valid')
    expect(calls).toHaveLength(1)
    expect(result.turn.task).toBe('brand')
  })

  it('answers a conversation without touching the workspace', async () => {
    const { call } = scripted([JSON.stringify(chatTurn)])
    const result = await composeWorkspace({ intent: 'how should I price my boxes?' }, call)
    expect(result.outcome).toBe('valid')
    expect(result.turn.actions).toEqual([])
  })

  it('asks again once, with the reasons, and says it was retried', async () => {
    const { call, calls } = scripted(['not json', validOpenReply])
    const result = await composeWorkspace(request, call)
    expect(result.outcome).toBe('retried')
    expect(calls).toHaveLength(2)
    expect(calls[0].user).not.toContain('validation_errors')
    expect(calls[1].user).toContain('validation_errors')
    expect(calls[1].user).toContain('not valid JSON')
    expect(result.attempts.map((a) => a.errors.length > 0)).toEqual([true, false])
  })

  it('sends the workspace and the conversation both times, and the same schema and instructions', async () => {
    const { call, calls } = scripted(['nope', JSON.stringify(chatTurn)])
    await composeWorkspace({ intent: 'x', workspace: openSnapshot(), history: [{ role: 'founder', text: 'hi' }] }, call)
    for (const sent of calls) {
      expect(sent.user).toContain('"selectedColour"')
      expect(sent.user).toContain('Founder: hi')
    }
    expect(calls[1].system).toBe(calls[0].system)
    expect(calls[1].schema).toEqual(calls[0].schema)
  })

  it('treats actions that cannot be done on this workspace as a bad reply, and sends the reason back', async () => {
    const impossible = JSON.stringify({ task: 'brand', message: 'Done.', memoryUsed: [], actions: [{ type: 'remove_colour', index: 7 }] })
    const { call, calls } = scripted([impossible, JSON.stringify(chatTurn)])
    const result = await composeWorkspace({ intent: 'remove colour 7', view: 'brand', workspace: openSnapshot() }, call)
    expect(result.outcome).toBe('retried')
    expect(calls[1].user).toContain('There is no colour 7')
  })

  it('opens nothing after two bad answers when nothing is open: it says so, with a note, and asks again', async () => {
    const { call } = scripted(['nope', '{"task":"brand"}'])
    const result = await composeWorkspace(request, call)
    expect(result.outcome).toBe('fallback')
    expect(result.note).toBe(FALLBACK_NOTE)
    expect(result.turn.actions).toEqual([])
    expect(result.turn.opens).toBeUndefined()
    expect(checkTurnFor(result.turn, { intent: 'x' })).toEqual([])
  })

  it('changes nothing after two bad answers when a workspace is open', async () => {
    const { call } = scripted(['nope', 'nope'])
    const result = await composeWorkspace({ intent: 'x', workspace: openSnapshot() }, call)
    expect(result.outcome).toBe('fallback')
    expect(result.turn.actions).toEqual([])
    expect(result.turn.message).toMatch(/changed nothing/)
  })

  it('does not retry or fall back when the model cannot be reached', async () => {
    const { call, calls } = scripted([new ComposeError('unavailable', 'down')])
    await expect(composeWorkspace(request, call)).rejects.toMatchObject({ kind: 'unavailable' })
    expect(calls).toHaveLength(1)
  })

  it('never lets an invalid turn through', async () => {
    const { call } = scripted(['{"task":"brand","message":"x","actions":[{"type":"set_colour","index":1,"hex":"#1"}],"memoryUsed":[]}', 'nope'])
    const result = await composeWorkspace(request, call)
    expect(checkTurnFor(result.turn, { intent: 'x' })).toEqual([])
  })
})

describe('fallbackTurn', () => {
  it('is a valid turn the app can apply', () => {
    expect(checkTurnFor(fallbackTurn('brand', false), { intent: 'x' })).toEqual([])
    expect(checkTurnFor(fallbackTurn('chat', false), { intent: 'x' })).toEqual([])
    expect(checkTurnFor(fallbackTurn(undefined, true), { intent: 'x', workspace: openSnapshot() })).toEqual([])
  })

  it('never opens a workspace: with none open it asks again, whatever task it was for', () => {
    for (const task of ['brand', 'invoice', 'ideation', 'chat', undefined] as const) {
      const turn = fallbackTurn(task, false)
      expect(turn.actions).toEqual([])
      expect(turn.opens).toBeUndefined()
      expect(turn.message).toMatch(/say it another way/)
    }
  })
})
