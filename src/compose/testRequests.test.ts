import { composeRequestSchema, TASKS } from './spec.ts'
import { TEST_REQUESTS } from './testRequests.ts'

describe('the fixed test requests', () => {
  it('are all valid requests, with unique ids', () => {
    for (const test of TEST_REQUESTS) expect(composeRequestSchema.safeParse(test.request).success, test.id).toBe(true)
    expect(new Set(TEST_REQUESTS.map((t) => t.id)).size).toBe(TEST_REQUESTS.length)
  })

  it('expect real tasks, and cover talking, acting, advice, refusing and injection', () => {
    for (const test of TEST_REQUESTS) expect(TASKS).toContain(test.expect.task)
    const ids = TEST_REQUESTS.map((t) => t.id).join(' ')
    for (const needed of ['palette-', 'chat-', 'advice-', 'act-', 'follow-up', 'route-', 'save-refused', 'injection', 'chat-names', 'chat-thanks', 'invoice-bare', 'invoice-fill', 'invoice-no-price', 'invoice-advice', 'invoice-undo', 'board-ideas', 'board-expand', 'board-cluster', 'board-template', 'board-fill', 'board-advice', 'board-delete-refused', 'board-edit-refused', 'board-not-live', 'board-route-invoice', 'route-board', 'board-summary', 'board-summary-empty', 'board-remember-refused']) expect(ids).toContain(needed)
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
