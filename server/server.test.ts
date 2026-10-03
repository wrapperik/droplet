import { describe, expect, it } from 'vitest'
import { ComposeError, type ModelCaller } from '../src/compose/compose.ts'
import { validOpenReply } from '../src/compose/fixtures.ts'
import { handleCompose, type ComposeServiceDeps } from './composeService.ts'
import type { CompositionLogEntry } from './compositionLog.ts'
import { createRateLimiter } from './rateLimit.ts'

const deps = (call: ModelCaller | null, max = 100) => {
  const logged: CompositionLogEntry[] = []
  const value: ComposeServiceDeps = { call, limiter: createRateLimiter(max, 60_000), log: (entry) => void logged.push(entry) }
  return { value, logged }
}
const good: ModelCaller = async () => validOpenReply

describe('handleCompose', () => {
  it('answers a good request with the spec and how it went, and logs it', async () => {
    const { value, logged } = deps(good)
    const reply = await handleCompose({ intent: 'a colour palette for my gift box business' }, value)
    expect(reply.status).toBe(200)
    expect(reply.body).toMatchObject({ outcome: 'valid', turn: { task: 'brand' } })
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatchObject({ outcome: 'valid', task: 'brand', actions: 1, badReplies: 0 })
  })

  it('rejects a request that is not shaped right, before any model is called', async () => {
    let called = false
    const { value } = deps(async () => {
      called = true
      return validOpenReply
    })
    expect((await handleCompose({ intent: '' }, value)).status).toBe(400)
    expect((await handleCompose('hello', value)).status).toBe(400)
    expect((await handleCompose({ intent: 'x'.repeat(601) }, value)).status).toBe(400)
    expect(called).toBe(false)
  })

  it('says plainly when there is no key, and logs it', async () => {
    const { value, logged } = deps(null)
    const reply = await handleCompose({ intent: 'a palette' }, value)
    expect(reply.status).toBe(503)
    expect(reply.body).toMatchObject({ error: 'no_key' })
    expect(String(reply.body.message)).toContain('.env.local')
    expect(logged[0]).toMatchObject({ outcome: 'error', error: 'no_key' })
  })

  it('stops asking the model once the hourly limit is reached', async () => {
    const { value } = deps(good, 2)
    expect((await handleCompose({ intent: 'a' }, value)).status).toBe(200)
    expect((await handleCompose({ intent: 'b' }, value)).status).toBe(200)
    expect((await handleCompose({ intent: 'c' }, value)).status).toBe(429)
  })

  it.each([
    ['bad_key', 502],
    ['rate_limited', 429],
    ['timeout', 504],
    ['unavailable', 503],
    ['blocked', 422],
  ] as const)('maps a "%s" model error to status %i', async (kind, status) => {
    const { value, logged } = deps(async () => {
      throw new ComposeError(kind, 'x')
    })
    const reply = await handleCompose({ intent: 'a palette' }, value)
    expect(reply.status).toBe(status)
    expect(reply.body).toMatchObject({ error: kind })
    expect(logged[0]).toMatchObject({ outcome: 'error', error: kind })
  })

  it('logs a fallback and what went wrong, and still answers', async () => {
    const { value, logged } = deps(async () => 'not json')
    const reply = await handleCompose({ intent: 'a palette' }, value)
    expect(reply.status).toBe(200)
    expect(reply.body).toMatchObject({ outcome: 'fallback' })
    expect(typeof reply.body.note).toBe('string')
    expect(logged[0]).toMatchObject({ outcome: 'fallback', badReplies: 2 })
    expect(logged[0].problems?.length).toBeGreaterThan(0)
  })

  it('says plainly when the daily quota is used up, with how long it will be, and logs which model answered', async () => {
    const { value, logged } = deps(async () => {
      throw new ComposeError('quota', 'The free daily limit for gemini-3.8-flash is used up. It resets in about 5 hours.', 18494)
    })
    const reply = await handleCompose({ intent: 'a palette' }, value)
    expect(reply.status).toBe(429)
    expect(reply.body).toMatchObject({ error: 'quota', message: 'The free daily limit for gemini-3.8-flash is used up. It resets in about 5 hours.' })
    expect(logged[0]).toMatchObject({ outcome: 'error', error: 'quota' })

    const answered = deps(good)
    answered.value.modelUsed = () => 'gemini-3.5-flash-lite'
    await handleCompose({ intent: 'a palette' }, answered.value)
    expect(answered.logged[0]).toMatchObject({ outcome: 'valid', model: 'gemini-3.5-flash-lite' })
  })

  it('never reveals anything from the model\'s errors beyond the fixed messages', async () => {
    const { value } = deps(async () => {
      throw new ComposeError('bad_request', 'SECRET detail from upstream')
    })
    const reply = await handleCompose({ intent: 'a palette' }, value)
    expect(JSON.stringify(reply.body)).not.toContain('SECRET')
  })
})

describe('createRateLimiter', () => {
  it('lets requests through again as the window moves on', () => {
    let time = 0
    const limiter = createRateLimiter(2, 1000, () => time)
    expect([limiter.take(), limiter.take(), limiter.take()]).toEqual([true, true, false])
    time = 1001
    expect(limiter.take()).toBe(true)
  })
})
