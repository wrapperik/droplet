import { boardTurnSchema } from './boardSpec.ts'
import { chatTurn, openBoardSnapshot, openSnapshot } from './fixtures.ts'
import { invoiceTurnSchema } from './invoiceSpec.ts'
import { librarySnapshotSchema, type LibrarySnapshot } from './librarySnapshot.ts'
import { buildUserContent, systemPromptFor } from './prompt.ts'
import { checkScreenActions, checkTurnFor } from './rules.ts'
import { isScreenAction } from './screenActions.ts'
import { composeRequestSchema, turnJsonSchema, turnSchema, type AnyTurn, type ComposeRequest } from './spec.ts'

const library: LibrarySnapshot = {
  brand: true,
  ideas: { notes: 5, frames: 2 },
  invoices: [
    { number: 'INV-0003', client: 'Pretoria Print Works', status: 'Not exported yet', ready: true },
    { number: 'INV-0002', client: 'Bloem Bakery', status: 'Exported 4 Oct', ready: true },
    { number: 'INV-0001', client: 'Bloem Bakery', status: 'Not exported yet', ready: false },
  ],
}
const none: LibrarySnapshot = { brand: false, ideas: null, invoices: [] }
const opens = { because: 'asked', quote: 'open my last invoice' }
const open = (item: string, extra: object = {}) => ({ type: 'open_item', item, ...extra })
const exportItem = (item: string, extra: object = {}) => ({ type: 'export_item', item, ...extra })
const turnWith = (actions: unknown[], extra: object = {}) => ({ ...chatTurn, actions, ...extra }) as unknown as AnyTurn
const request = (over: Partial<ComposeRequest> = {}): ComposeRequest => ({ intent: 'open my last invoice', library, ...over })

describe('the library actions in every turn schema', () => {
  it.each([
    ['palette', turnSchema],
    ['invoice', invoiceTurnSchema],
    ['board', boardTurnSchema],
  ])('are accepted in the %s turn, and only for what the library holds', (_name, schema) => {
    expect(schema.safeParse({ ...chatTurn, actions: [open('invoice', { which: 'INV-0002' })], opens }).success).toBe(true)
    expect(schema.safeParse({ ...chatTurn, actions: [exportItem('ideas', { format: 'png' })] }).success).toBe(true)
    expect(schema.safeParse({ ...chatTurn, actions: [open('logo')] }).success).toBe(false)
    expect(schema.safeParse({ ...chatTurn, actions: [exportItem('ideas', { format: 'gif' })] }).success).toBe(false)
    expect(schema.safeParse({ ...chatTurn, actions: [{ type: 'open_item' }] }).success).toBe(false)
  })

  it('are in the schema the model is sent, for each workspace', () => {
    for (const view of [undefined, 'brand', 'invoice', 'board'] as const) {
      const sent = JSON.stringify(turnJsonSchema(view))
      expect(sent).toContain('open_item')
      expect(sent).toContain('export_item')
    }
  })

  it('have no way to forget, copy or change anything in the library', () => {
    const sent = JSON.stringify(turnJsonSchema(undefined))
    for (const word of ['forget_item', 'delete_item', 'copy_item', 'edit_item']) expect(sent).not.toContain(`"${word}`)
  })

  it('are screen actions', () => {
    expect(isScreenAction({ type: 'open_item' })).toBe(true)
    expect(isScreenAction({ type: 'export_item' })).toBe(true)
  })
})

describe('checking opening something from the library', () => {
  it('lets a saved invoice, the palette and the board through, with the founder\'s words', () => {
    expect(checkScreenActions(turnWith([open('invoice')], { opens }), request())).toEqual([])
    expect(checkScreenActions(turnWith([open('invoice', { which: 'INV-0002' })], { opens }), request())).toEqual([])
    expect(checkScreenActions(turnWith([open('invoice', { which: 'Bloem Bakery' })], { opens }), request())).toEqual([])
    expect(checkScreenActions(turnWith([open('brand')], { opens }), request())).toEqual([])
    expect(checkScreenActions(turnWith([open('ideas')], { opens }), request())).toEqual([])
  })

  it('needs opens, since it opens a workspace', () => {
    expect(checkScreenActions(turnWith([open('invoice')]), request())[0]).toMatch(/needs opens/)
  })

  it('is checked for the founder\'s own words by the usual opening check', () => {
    const turn = turnWith([open('invoice')], { opens: { because: 'asked', quote: 'something they did not say' } })
    expect(checkTurnFor(turn, request({ view: 'brand', workspace: openSnapshot(), open: ['brand'] })).join(' ')).toMatch(/not in the founder's message/)
  })

  it('refuses what is not saved, and says what to do instead', () => {
    expect(checkScreenActions(turnWith([open('brand')], { opens }), request({ library: none }))[0]).toMatch(/no palette is saved/)
    expect(checkScreenActions(turnWith([open('ideas')], { opens }), request({ library: none }))[0]).toMatch(/no board is saved/)
    expect(checkScreenActions(turnWith([open('invoice')], { opens }), request({ library: none }))[0]).toMatch(/no invoice is saved/)
    expect(checkScreenActions(turnWith([open('invoice')], { opens }), request({ library: undefined }))[0]).toMatch(/no invoice is saved/)
  })

  it('refuses an invoice that is not one of the saved ones, and lists them', () => {
    const errors = checkScreenActions(turnWith([open('invoice', { which: 'INV-0099' })], { opens }), request())
    expect(errors[0]).toMatch(/not one of the saved invoices \(INV-0003, INV-0002, INV-0001\)/)
  })

  it('refuses a which on anything but an invoice', () => {
    expect(checkScreenActions(turnWith([open('brand', { which: 'last' })], { opens }), request())[0]).toMatch(/which is only for an invoice/)
  })

  it('goes on its own', () => {
    const errors = checkScreenActions(turnWith([open('invoice'), { type: 'undo' }], { opens }), request())
    expect(errors.join(' ')).toMatch(/goes on its own/)
  })

  it('is one screen action, with switching and closing', () => {
    expect(checkScreenActions(turnWith([open('invoice'), { type: 'close_workspace' }], { opens }), request())[0]).toMatch(/at most one/)
  })
})

describe('checking exporting something from the library', () => {
  it('lets a saved invoice that is ready, the palette and the board through, with no opens', () => {
    expect(checkScreenActions(turnWith([exportItem('invoice')]), request())).toEqual([])
    expect(checkScreenActions(turnWith([exportItem('brand')]), request())).toEqual([])
    expect(checkScreenActions(turnWith([exportItem('ideas', { format: 'png' })]), request())).toEqual([])
  })

  it('refuses an invoice that is not ready to export, and says to open it', () => {
    const errors = checkScreenActions(turnWith([exportItem('invoice', { which: 'INV-0001' })]), request())
    expect(errors[0]).toMatch(/not ready to export.*offer to open it/)
  })

  it('refuses what is not saved', () => {
    expect(checkScreenActions(turnWith([exportItem('brand')]), request({ library: none }))[0]).toMatch(/no palette is saved/)
    expect(checkScreenActions(turnWith([exportItem('ideas')]), request({ library: none }))[0]).toMatch(/no board is saved/)
  })

  it('finds "the last one" and a client\'s name among the saved invoices', () => {
    expect(checkScreenActions(turnWith([exportItem('invoice', { which: 'the last one' })]), request())).toEqual([])
    expect(checkScreenActions(turnWith([exportItem('invoice', { which: 'bloem bakery' })]), request())).toEqual([])
  })

  it('is checked as a whole on a workspace without disturbing what the workspace allows', () => {
    const turn = turnWith([exportItem('ideas')], { task: 'chat' })
    expect(checkTurnFor(turn, request({ view: 'board', board: openBoardSnapshot(), open: ['board'] }))).toEqual([])
    expect(checkTurnFor(turn, request())).toEqual([])
  })
})

describe('what the composer is told about the library', () => {
  it('is in the request, validated: counts, names and statuses only', () => {
    expect(librarySnapshotSchema.safeParse(library).success).toBe(true)
    expect(composeRequestSchema.safeParse({ intent: 'hi', library }).success).toBe(true)
    expect(librarySnapshotSchema.safeParse({ ...library, invoices: Array.from({ length: 13 }, () => library.invoices[0]) }).success).toBe(false)
  })

  it('is described in words, newest invoice first, with a note on any that cannot be exported', () => {
    const content = buildUserContent({ intent: 'what do I have?', library })
    expect(content).toContain('<library>')
    expect(content).toContain('"palette": "saved"')
    expect(content).toContain('saved, 5 notes and 2 frames')
    expect(content).toContain('INV-0003 for Pretoria Print Works: Not exported yet')
    expect(content).toContain('INV-0001 for Bloem Bakery: Not exported yet, not ready to export')
  })

  it('says nothing is saved for an empty project, and is left out of a request that has none', () => {
    expect(buildUserContent({ intent: 'hi', library: none })).toContain('"palette": "none saved"')
    expect(buildUserContent({ intent: 'hi' })).not.toContain('<library>')
  })

  it('never carries an address, contact, bank detail or amount', () => {
    const content = buildUserContent({ intent: 'hi', library })
    expect(content).not.toMatch(/R\s?\d|@|Church Square/)
  })
})

describe('what every prompt says about the library', () => {
  it.each([undefined, 'brand', 'invoice', 'board'] as const)('tells %s, in Quick and in Advanced, to open and export only what is listed and only when asked', (view) => {
    for (const mode of ['base', 'advanced'] as const) {
      const prompt = systemPromptFor(view, mode)
      expect(prompt).toMatch(/<library> says what the founder has saved/)
      expect(prompt).toMatch(/open_item/)
      expect(prompt).toMatch(/export_item/)
      expect(prompt).toMatch(/it needs opens with their exact words/)
      expect(prompt).toMatch(/never say that it worked/)
      expect(prompt).toMatch(/Only what <library> lists can be opened or exported/)
      expect(prompt).toMatch(/You cannot copy, forget or change anything in the library/)
      expect(prompt).toMatch(/The Library \(a row in the sidebar\)/)
      expect(prompt).not.toContain('—')
    }
  })
})
