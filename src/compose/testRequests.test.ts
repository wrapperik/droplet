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
    for (const needed of ['palette-', 'chat-', 'advice-', 'act-', 'follow-up', 'route-', 'save-refused', 'injection', 'invoice-fill', 'invoice-no-price', 'invoice-advice', 'invoice-undo']) expect(ids).toContain(needed)
  })
})
