import { chatTurn, openBoardSnapshot, openInvoiceSnapshot, openSnapshot } from './fixtures.ts'
import { boardTurnSchema } from './boardSpec.ts'
import { invoiceTurnSchema } from './invoiceSpec.ts'
import { OPEN_PHRASE, workspaceForPhrase } from './journey.ts'
import { buildUserContent, describeOpen, systemPromptFor } from './prompt.ts'
import { checkScreenActions, checkTurnFor } from './rules.ts'
import { isScreenAction, WORKSPACE_NAMES } from './screenActions.ts'
import { turnJsonSchema, turnSchema, type AnyTurn, type ComposeRequest } from './spec.ts'

const switchTo = (workspace: string) => ({ type: 'switch_to', workspace })
const close = { type: 'close_workspace' }
const turnWith = (actions: unknown[], extra: object = {}) => ({ ...chatTurn, actions, ...extra }) as unknown as AnyTurn
const request = (over: Partial<ComposeRequest> = {}): ComposeRequest => ({ intent: 'x', ...over })

describe('the screen actions in every turn schema', () => {
  it.each([
    ['palette', turnSchema],
    ['invoice', invoiceTurnSchema],
    ['board', boardTurnSchema],
  ])('are accepted in the %s turn, and a workspace that does not exist is not', (_name, schema) => {
    expect(schema.safeParse({ ...chatTurn, actions: [switchTo('invoice')] }).success).toBe(true)
    expect(schema.safeParse({ ...chatTurn, actions: [switchTo('board')] }).success).toBe(true)
    expect(schema.safeParse({ ...chatTurn, actions: [close] }).success).toBe(true)
    expect(schema.safeParse({ ...chatTurn, actions: [switchTo('logo')] }).success).toBe(false)
    expect(schema.safeParse({ ...chatTurn, actions: [{ type: 'switch_to' }] }).success).toBe(false)
  })

  it('are in the schema the model is sent, for each workspace', () => {
    for (const view of [undefined, 'brand', 'invoice', 'board'] as const) {
      const sent = JSON.stringify(turnJsonSchema(view))
      expect(sent).toContain('switch_to')
      expect(sent).toContain('close_workspace')
    }
  })

  it('are recognised by type', () => {
    expect(isScreenAction({ type: 'switch_to' })).toBe(true)
    expect(isScreenAction({ type: 'close_workspace' })).toBe(true)
    expect(isScreenAction({ type: 'undo' })).toBe(false)
    expect(isScreenAction({ type: 'set_palette' })).toBe(false)
  })
})

describe('checking a screen action', () => {
  it('lets a switch to a workspace that is open and not on screen through, with no opens', () => {
    expect(checkScreenActions(turnWith([switchTo('invoice')]), request({ view: 'brand', open: ['brand', 'invoice'] }))).toEqual([])
    expect(checkScreenActions(turnWith([switchTo('board')]), request({ view: 'invoice', open: ['invoice', 'board'] }))).toEqual([])
  })

  it('refuses a switch to a workspace that is not open, and points to opens', () => {
    const errors = checkScreenActions(turnWith([switchTo('invoice')]), request({ view: 'brand', open: ['brand'] }))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/the invoice workspace is not open, and an action cannot open it/)
    expect(errors[0]).toMatch(/opens/)
  })

  it('refuses a switch to the workspace that is already on screen, and one with nothing open', () => {
    expect(checkScreenActions(turnWith([switchTo('brand')]), request({ view: 'brand', open: ['brand', 'invoice'] }))[0]).toMatch(/already on screen/)
    expect(checkScreenActions(turnWith([switchTo('brand')]), request())[0]).toMatch(/not open/)
  })

  it('reads the palette\'s workspace, or the view alone, as the one on screen when the request does not list what is open', () => {
    expect(checkScreenActions(turnWith([switchTo('brand')]), request({ workspace: openSnapshot() }))[0]).toMatch(/already on screen/)
    expect(checkScreenActions(turnWith([switchTo('brand')]), request({ view: 'invoice', invoice: openInvoiceSnapshot() }))[0]).toMatch(/not open/)
  })

  it('lets close_workspace through when something is open, and refuses it when nothing is', () => {
    expect(checkScreenActions(turnWith([close]), request({ view: 'board', board: openBoardSnapshot() }))).toEqual([])
    expect(checkScreenActions(turnWith([close]), request({ view: 'brand', open: ['brand', 'invoice'] }))).toEqual([])
    expect(checkScreenActions(turnWith([close]), request())[0]).toMatch(/nothing to close/)
  })

  it('allows one screen action in a reply, not two', () => {
    expect(checkScreenActions(turnWith([switchTo('invoice'), close]), request({ view: 'brand', open: ['brand', 'invoice'] }))[0]).toMatch(/at most one/)
  })

  it('has nothing to say about a reply with none', () => {
    expect(checkScreenActions(turnWith([{ type: 'undo' }]), request({ view: 'brand', open: ['brand'] }))).toEqual([])
    expect(checkScreenActions(turnWith([]), request())).toEqual([])
  })
})

describe('a reply with a screen action, checked as a whole', () => {
  const ws = openSnapshot()

  it('is fine as a conversation on any workspace, whatever task it names', () => {
    for (const task of ['chat', 'invoice', 'brand', 'ideation'] as const) {
      const turn = turnWith([switchTo('invoice')], { task })
      expect(checkTurnFor(turn, request({ view: 'brand', workspace: ws, open: ['brand', 'invoice'] })), task).toEqual([])
    }
  })

  it('is not taken for a reply that names another workspace and does nothing: switching is doing something', () => {
    const turn = turnWith([switchTo('invoice')], { task: 'invoice', question: undefined })
    expect(checkTurnFor(turn, request({ view: 'brand', workspace: ws, open: ['brand', 'invoice'] }))).toEqual([])
  })

  it('is not taken for opening the palette when nothing is open: a screen action does not open anything', () => {
    const turn = turnWith([close], { task: 'brand' })
    expect(checkTurnFor(turn, request({ open: ['brand'], view: 'brand', workspace: ws }))).toEqual([])
    expect(checkTurnFor(turnWith([switchTo('brand')], { task: 'brand' }), request())).toHaveLength(1)
  })

  it('may come with the workspace\'s own actions, which are checked as they were, and the screen action after them', () => {
    const invoice = openInvoiceSnapshot()
    const ok = turnWith([{ type: 'set_terms', terms: '30' }, switchTo('brand')], { task: 'invoice' })
    expect(checkTurnFor(ok, request({ view: 'invoice', invoice, open: ['invoice', 'brand'] }))).toEqual([])
    const bad = turnWith([{ type: 'set_terms', terms: '30' }, switchTo('board')], { task: 'invoice' })
    expect(checkTurnFor(bad, request({ view: 'invoice', invoice, open: ['invoice', 'brand'] }))[0]).toMatch(/the business idea board is not open/)
  })

  it('does not let the screen action excuse a workspace action that does not fit', () => {
    const turn = turnWith([{ type: 'set_colour', index: 99, hex: '#123456' }, close], { task: 'brand' })
    expect(checkTurnFor(turn, request({ view: 'brand', workspace: ws, open: ['brand'] })).join(' ')).toMatch(/set_colour/)
  })
})

describe('the Open phrases', () => {
  it('are recognised only when the message is exactly one of them, apart from the spaces round it', () => {
    for (const [workspace, phrase] of Object.entries(OPEN_PHRASE)) {
      expect(workspaceForPhrase(phrase)).toBe(workspace)
      expect(workspaceForPhrase(`  ${phrase}\n`)).toBe(workspace)
    }
    expect(workspaceForPhrase('open the invoice workspace')).toBeNull()
    expect(workspaceForPhrase('Open the invoice workspace please')).toBeNull()
    expect(workspaceForPhrase('Please open the invoice workspace')).toBeNull()
    expect(workspaceForPhrase('')).toBeNull()
  })
})

describe('what the composer is told about the open workspaces', () => {
  it('lists them and marks the one on screen, or says none', () => {
    expect(describeOpen({ view: 'invoice', open: ['brand', 'invoice'] })).toBe('brand workspace (brand)\ninvoice workspace (invoice), on screen')
    expect(describeOpen({})).toBe('none')
    expect(describeOpen({ view: 'board' })).toBe('business idea board (board), on screen')
    expect(describeOpen({ workspace: openSnapshot() })).toBe('brand workspace (brand), on screen')
    expect(Object.keys(WORKSPACE_NAMES)).toEqual(['brand', 'invoice', 'board'])
  })

  it('is in every request', () => {
    expect(buildUserContent({ intent: 'hi' })).toContain('<open_workspaces>\nnone\n</open_workspaces>')
    expect(buildUserContent({ intent: 'hi', view: 'board', open: ['board', 'invoice'], board: openBoardSnapshot() })).toContain('<open_workspaces>\nbusiness idea board (board), on screen\ninvoice workspace (invoice)\n</open_workspaces>')
  })
})

describe('what every prompt says about moving between workspaces', () => {
  it.each([undefined, 'brand', 'invoice', 'board'] as const)('tells %s, in Quick and in Advanced, to switch to an open workspace and close on request, and never on its own', (view) => {
    for (const mode of ['base', 'advanced'] as const) {
      const prompt = systemPromptFor(view, mode)
      expect(prompt).toMatch(/switch_to with its name/)
      expect(prompt).toMatch(/close_workspace/)
      expect(prompt).toMatch(/let's go back to the invoice/)
      expect(prompt).toMatch(/close the workspace/)
      expect(prompt).toMatch(/only when they ask: never switch or close because you think it would help/)
      expect(prompt).toMatch(/never say that their work is lost or that it is closed/)
      expect(prompt).not.toContain('—')
    }
  })

  it('says a tap on Open arrives with the workspace already open, so it is not opened again', () => {
    expect(systemPromptFor('board', 'base')).toMatch(/The app opens the workspace before you see the message, so it is already on screen: do not set opens/)
  })
})
