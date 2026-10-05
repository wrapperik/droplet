import { composeRequestSchema, TASKS } from './spec.ts'
import { TEST_REQUESTS } from './testRequests.ts'

describe('the fixed test requests', () => {
  it('are all valid requests, with unique ids', () => {
    for (const test of TEST_REQUESTS) expect(composeRequestSchema.safeParse(test.request).success, test.id).toBe(true)
    expect(new Set(TEST_REQUESTS.map((t) => t.id)).size).toBe(TEST_REQUESTS.length)
  })

  it('expect real tasks, and cover talking, acting, advice, refusing and injection', () => {
    for (const test of TEST_REQUESTS) for (const task of [test.expect.task].flat()) expect(TASKS).toContain(task)
    const ids = TEST_REQUESTS.map((t) => t.id).join(' ')
    for (const needed of ['palette-', 'chat-', 'advice-', 'act-', 'follow-up', 'route-', 'save-refused', 'injection', 'chat-names', 'chat-thanks', 'invoice-bare', 'invoice-fill', 'invoice-no-price', 'invoice-advice', 'invoice-undo', 'board-ideas', 'board-expand', 'board-cluster', 'board-template', 'board-fill', 'board-advice', 'board-delete-refused', 'board-edit-refused', 'board-not-live', 'board-route-invoice', 'route-board', 'board-summary', 'board-summary-empty', 'board-remember-refused', 'discover-first', 'discover-assets', 'discover-plan', 'plan-open-tap', 'invoice-logo-first', 'invoice-insist', 'logo-ask', 'compare-table']) expect(ids).toContain(needed)
  })

  it('check the conversation too: a follow-up question is expected, and a list where options were asked for', () => {
    expect(TEST_REQUESTS.filter((test) => test.expect.asks === true).length).toBeGreaterThan(3)
    expect(TEST_REQUESTS.some((test) => test.expect.asks === false)).toBe(true)
    expect(TEST_REQUESTS.some((test) => test.expect.list)).toBe(true)
    expect(TEST_REQUESTS.some((test) => test.expect.titles === true)).toBe(true)
    expect(TEST_REQUESTS.some((test) => test.expect.titles === false)).toBe(true)
  })

  it('include the board: adding, expanding, grouping, templates, filling prompts, and what it must refuse', () => {
    const board = TEST_REQUESTS.filter((test) => test.request.view === 'board')
    expect(board.length).toBeGreaterThanOrEqual(10)
    for (const test of board) expect(test.request.board, test.id).toBeDefined()
    expect(board.some((test) => test.expect.acts)).toBe(true)
    // asked to delete, to rewrite, or to carry on in the background, it must change nothing
    for (const id of ['board-delete-refused', 'board-edit-refused', 'board-not-live', 'board-remember-refused', 'board-summary-empty']) expect(TEST_REQUESTS.find((test) => test.id === id)?.expect.acts).toBe(false)
    expect(TEST_REQUESTS.some((test) => test.expect.addsNotes !== undefined)).toBe(true)
  })
})

describe('the guiding requests', () => {
  const byId = (id: string) => TEST_REQUESTS.find((test) => test.id === id)!

  it('expect nothing to open unless the founder asked or agreed, and a quote when something does', () => {
    for (const id of ['discover-first', 'discover-assets', 'discover-plan', 'plan-agreed', 'invoice-logo-first', 'invoice-question', 'logo-ask', 'compare-table', 'what-can-you-do', 'email-not-built', 'palette-vague']) {
      expect(byId(id).expect.opens, id).toBe(false)
    }
    for (const id of ['plan-open-tap', 'invoice-insist', 'route-invoice', 'route-board', 'palette-gift', 'injection']) expect(byId(id).expect.opens, id).toBe(true)
  })

  it('include the founder who started it all, a plan, a table, and being pushed for the logo before an invoice', () => {
    expect(byId('discover-first').request.intent).toBe('I want to create a dev studio called DuckStack')
    expect(byId('discover-plan').expect.blocks).toBe('checklist')
    expect(byId('compare-table').expect.blocks).toBe('table')
    expect(byId('invoice-logo-first').request.project?.hasPalette).toBe(false)
  })

  it('give every opening a quote that is really in the founder\'s own words, so it can pass the app\'s check', () => {
    for (const id of ['plan-open-tap', 'invoice-insist', 'route-board', 'invoice-route-brand']) expect(byId(id).request.intent.length, id).toBeGreaterThan(3)
  })
})
