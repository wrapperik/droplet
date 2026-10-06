import { describe, expect, it } from 'vitest'
import { ComposeError, type ModelCaller } from '../src/compose/compose.ts'
import { validOpenReply } from '../src/compose/fixtures.ts'
import { allowanceOf, BUSY_NOTE, handleAllowance, handleCompose, type ComposeServiceDeps } from './composeService.ts'
import type { CompositionLogEntry } from './compositionLog.ts'
import { createAdvancedAllowance, createRateLimiter } from './rateLimit.ts'
import { chatTurn } from '../src/compose/fixtures.ts'

const deps = (call: ModelCaller | null, max = 100) => {
  const logged: CompositionLogEntry[] = []
  const value: ComposeServiceDeps = { call, limiter: createRateLimiter(max, 60_000), advanced: createAdvancedAllowance(10), log: (entry) => void logged.push(entry) }
  return { value, logged }
}
const good: ModelCaller = async () => validOpenReply

describe('handleCompose', () => {
  it('answers a good request with the spec and how it went, and logs it', async () => {
    const { value, logged } = deps(good)
    const reply = await handleCompose({ intent: 'a colour palette for my gift box business' }, value)
    expect(reply.status).toBe(200)
    expect(reply.body).toMatchObject({ outcome: 'valid', answeredBy: 'base', turn: { task: 'brand' } })
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

    const answered = deps(async () => ({ text: validOpenReply, meta: { model: 'gemini-3.5-flash-lite', answeredBy: 'base' as const } }))
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

describe('Quick and Advanced', () => {
  const grounding = { queries: ['cipc fee'], sources: [{ title: 'cipc.co.za', url: 'https://www.cipc.co.za/' }] }
  const usage = { prompt: 1500, answer: 90, thinking: 20 }
  // A caller that answers as the mode it is asked for, as the real one does, and remembers what it was asked.
  const answering = (options: { spare?: boolean; searched?: boolean } = {}) => {
    const asked: { mode?: string; search?: boolean }[] = []
    const call: ModelCaller = async (request) => {
      asked.push({ mode: request.mode, search: request.search })
      const fellBack = request.mode === 'advanced' && options.spare
      const answeredBy = request.mode === 'advanced' && !fellBack ? ('advanced' as const) : ('base' as const)
      return {
        text: JSON.stringify(chatTurn),
        ...(options.searched && answeredBy === 'advanced' ? { grounding } : {}),
        meta: { model: answeredBy === 'advanced' ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite', answeredBy, ...(fellBack ? { spared: true } : {}), usage },
      }
    }
    return { call, asked }
  }
  const setup = (call: ModelCaller, perDay = 10) => {
    const logged: CompositionLogEntry[] = []
    const advanced = createAdvancedAllowance(perDay)
    const value: ComposeServiceDeps = { call, limiter: createRateLimiter(1000, 60_000), advanced, log: (entry) => void logged.push(entry) }
    return { value, logged, advanced }
  }

  it('asks Quick for a request that names no mode, never lets it search, and says so in the answer', async () => {
    const { call, asked } = answering()
    const { value, logged } = setup(call)
    const reply = await handleCompose({ intent: 'hi' }, value)
    expect(asked).toEqual([{ mode: 'base', search: undefined }])
    expect(reply.body).toMatchObject({ outcome: 'valid', answeredBy: 'base', allowance: { advancedLeft: 10, advancedLimit: 10, resetsAt: null } })
    expect(logged[0]).toMatchObject({ mode: 'base', answeredBy: 'base', model: 'gemini-3.5-flash-lite' })
  })

  it('asks Advanced when the founder chose it, lets it search, and counts the answer against the allowance', async () => {
    const { call, asked } = answering({ searched: true })
    const { value, logged } = setup(call)
    const reply = await handleCompose({ intent: 'What does CIPC charge?', mode: 'advanced' }, value)
    expect(asked).toEqual([{ mode: 'advanced', search: true }])
    expect(reply.body).toMatchObject({ answeredBy: 'advanced', grounding, allowance: { advancedLeft: 9, advancedLimit: 10 } })
    expect(typeof (reply.body.allowance as { resetsAt: string }).resetsAt).toBe('string')
    expect(logged[0]).toMatchObject({ mode: 'advanced', answeredBy: 'advanced', model: 'gemini-3.8-flash', searches: 1 })
  })

  it('answers Quick requests without counting them, and counts only the Advanced ones: nothing but the founder\'s choice spends the allowance', async () => {
    const { call } = answering()
    const { value } = setup(call, 3)
    for (let i = 0; i < 5; i += 1) await handleCompose({ intent: `quick ${i}` }, value)
    expect(((await handleAllowance(value)).body.allowance as { advancedLeft: number }).advancedLeft).toBe(3)
    await handleCompose({ intent: 'advanced', mode: 'advanced' }, value)
    expect(((await handleAllowance(value)).body.allowance as { advancedLeft: number }).advancedLeft).toBe(2)
  })

  it('refuses the 11th Advanced request before any model is called, says when one comes back, and offers Quick', async () => {
    let time = 1_000_000
    const { call, asked } = answering()
    const logged: CompositionLogEntry[] = []
    const advanced = createAdvancedAllowance(10, 24 * 60 * 60 * 1000, () => time)
    const value: ComposeServiceDeps = { call, limiter: createRateLimiter(1000, 60_000), advanced, log: (entry) => void logged.push(entry), now: () => time }
    for (let i = 0; i < 10; i += 1) {
      time += 60_000
      expect((await handleCompose({ intent: `a${i}`, mode: 'advanced' }, value)).status).toBe(200)
    }
    expect(asked).toHaveLength(10)
    time += 3 * 60 * 60 * 1000
    const refused = await handleCompose({ intent: 'one more', mode: 'advanced' }, value)
    expect(refused.status).toBe(429)
    expect(refused.body).toMatchObject({ error: 'advanced_limit', allowance: { advancedLeft: 0, advancedLimit: 10 } })
    expect(String(refused.body.message)).toMatch(/used your 10 Advanced answers for today/)
    expect(String(refused.body.message)).toMatch(/One comes back in about \d+ hours?/)
    expect(String(refused.body.message)).toMatch(/Quick is still here/)
    // the model was not called, and the refusal is logged as an error
    expect(asked).toHaveLength(10)
    expect(logged.at(-1)).toMatchObject({ outcome: 'error', error: 'advanced_limit', mode: 'advanced' })
    // Quick is still answered
    expect((await handleCompose({ intent: 'quick' }, value)).status).toBe(200)
    // and the oldest answer ages out a day after it was given, so one comes back
    time += 24 * 60 * 60 * 1000
    expect((await handleCompose({ intent: 'again', mode: 'advanced' }, value)).status).toBe(200)
  })

  it('does not count against the founder an Advanced request that Quick answered because Google\'s model was busy, and says so', async () => {
    const { call } = answering({ spare: true })
    const { value, logged } = setup(call, 2)
    const reply = await handleCompose({ intent: 'What does CIPC charge?', mode: 'advanced' }, value)
    expect(reply.status).toBe(200)
    expect(reply.body).toMatchObject({ answeredBy: 'base', note: BUSY_NOTE, allowance: { advancedLeft: 2, advancedLimit: 2, resetsAt: null } })
    expect(BUSY_NOTE).toBe('Advanced is busy today, so I answered with Quick.')
    expect(logged[0]).toMatchObject({ mode: 'advanced', answeredBy: 'base' })
    expect(((await handleAllowance(value)).body.allowance as { advancedLeft: number }).advancedLeft).toBe(2)
  })

  it('puts the busy note before the simpler-answer note, when a busy Advanced was answered by Quick and Quick could not make sense of it', async () => {
    const call: ModelCaller = async () => ({ text: 'not json', meta: { model: 'gemini-3.5-flash-lite', answeredBy: 'base', spared: true } })
    const reply = await handleCompose({ intent: 'a palette', mode: 'advanced' }, setup(call).value)
    expect(reply.body).toMatchObject({ outcome: 'fallback' })
    expect(String(reply.body.note)).toMatch(/^Advanced is busy today, so I answered with Quick\. A simpler answer was used/)
  })

  it('answers with Quick, and says so, when the allowance cannot be read, rather than failing or guessing', async () => {
    const { call, asked } = answering()
    const { value } = setup(call)
    value.advanced = { limit: 10, status: () => Promise.reject(new Error('db down')), spend: () => undefined }
    const reply = await handleCompose({ intent: 'hi', mode: 'advanced' }, value)
    expect(reply.status).toBe(200)
    expect(asked).toEqual([{ mode: 'base', search: undefined }])
    expect(reply.body).toMatchObject({ answeredBy: 'base', note: 'Advanced is not available right now, so I answered with Quick.' })
    expect(reply.body.allowance).toBeUndefined()
    expect((await handleAllowance(value)).status).toBe(500)
  })

  it('turns Advanced off with an allowance of 0, and says where the allowance stands with an error too', async () => {
    const { call, asked } = answering()
    const { value } = setup(call, 0)
    const refused = await handleCompose({ intent: 'hi', mode: 'advanced' }, value)
    expect(refused.status).toBe(429)
    expect(refused.body).toMatchObject({ error: 'advanced_limit', message: 'Advanced is not available.', allowance: { advancedLeft: 0, advancedLimit: 0 } })
    expect(asked).toHaveLength(0)

    const failing = setup(async () => {
      throw new ComposeError('timeout', 'x')
    }).value
    expect((await handleCompose({ intent: 'hi' }, failing)).body).toMatchObject({ error: 'timeout', allowance: { advancedLeft: 10 } })
  })

  it('logs the tokens of the request, added up over a retry, and never puts them in the answer', async () => {
    let calls = 0
    const call: ModelCaller = async () => {
      calls += 1
      return { text: calls === 1 ? 'not json' : JSON.stringify(chatTurn), meta: { model: 'gemini-3.5-flash-lite', answeredBy: 'base', usage: { prompt: 1000, answer: 50, thinking: 10 } } }
    }
    const { value, logged } = setup(call)
    const reply = await handleCompose({ intent: 'hi' }, value)
    expect(reply.body.outcome).toBe('retried')
    expect(logged[0].tokens).toEqual({ prompt: 2000, answer: 100, thinking: 20 })
    expect(JSON.stringify(reply.body)).not.toMatch(/token|prompt|thinking/i)
  })

  it('logs when a search was asked for and refused', async () => {
    const call: ModelCaller = async () => ({ text: JSON.stringify(chatTurn), meta: { model: 'gemini-3.8-flash', answeredBy: 'advanced', searchRefused: true } })
    const { value, logged } = setup(call)
    await handleCompose({ intent: 'hi', mode: 'advanced' }, value)
    expect(logged[0]).toMatchObject({ searchRefused: true })
    expect(logged[0].searches).toBeUndefined()
  })

  it('rejects a mode that is not one', async () => {
    expect((await handleCompose({ intent: 'hi', mode: 'turbo' }, setup(answering().call).value)).status).toBe(400)
  })
})

describe('the Advanced allowance', () => {
  it('counts a sliding day, and says when the oldest answer returns', () => {
    let now = 0
    const allowance = createAdvancedAllowance(2, 1000, () => now)
    expect(allowance.status()).toEqual({ used: 0, oldestAt: null })
    now = 100
    allowance.spend()
    now = 400
    allowance.spend()
    expect(allowance.status()).toEqual({ used: 2, oldestAt: 100 })
    now = 1101
    expect(allowance.status()).toEqual({ used: 1, oldestAt: 400 })
  })

  it('says how many are left and when one comes back, as the interface is told', () => {
    const day = 24 * 60 * 60 * 1000
    expect(allowanceOf({ used: 3, oldestAt: 5000 }, 10)).toEqual({ advancedLeft: 7, advancedLimit: 10, resetsAt: new Date(5000 + day).toISOString() })
    expect(allowanceOf({ used: 12, oldestAt: null }, 10)).toEqual({ advancedLeft: 0, advancedLimit: 10, resetsAt: null })
  })
})
