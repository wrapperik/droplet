import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComposeError, type ModelCaller, type ModelRequest } from './compose.ts'
import { withFallback } from './providerFallback.ts'

const request: ModelRequest = { system: 'system', user: 'user', schema: {}, mode: 'advanced', search: true }

const quiet = () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
}

afterEach(() => vi.restoreAllMocks())

describe('a second provider behind the first', () => {
  it('is not asked when the first answers', async () => {
    const second = vi.fn<ModelCaller>()
    const call = withFallback({ name: 'DeepSeek', call: async () => 'first' }, { name: 'Gemini', call: second })
    expect(await call(request)).toBe('first')
    expect(second).not.toHaveBeenCalled()
  })

  it.each(['timeout', 'unavailable', 'quota', 'bad_key', 'bad_model', 'rate_limited', 'blocked', 'bad_request'] as const)('answers, as Quick and without searching, when the first fails with %s', async (kind) => {
    quiet()
    const second = vi.fn<ModelCaller>(async () => 'second')
    const call = withFallback({ name: 'DeepSeek', call: async () => { throw new ComposeError(kind, 'no') } }, { name: 'Gemini', call: second })
    expect(await call(request)).toBe('second')
    expect(second).toHaveBeenCalledWith({ ...request, mode: 'base', search: false })
  })

  it('answers when the first fails in a way nobody expected', async () => {
    quiet()
    const call = withFallback({ name: 'DeepSeek', call: async () => { throw new TypeError('bad JSON') } }, { name: 'Gemini', call: async () => 'second' })
    expect(await call(request)).toBe('second')
  })

  it('keeps the first error when both fail, and logs neither the request nor a key', async () => {
    quiet()
    const first = new ComposeError('quota', 'no balance')
    const call = withFallback({ name: 'DeepSeek', call: async () => { throw first } }, { name: 'Gemini', call: async () => { throw new ComposeError('bad_key', 'refused') } })
    await expect(call(request)).rejects.toBe(first)
    const logged = [...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls].flat().join(' ')
    expect(logged).toContain('DeepSeek could not answer (quota)')
    expect(logged).toContain('Gemini could not answer either (bad_key)')
    expect(logged).not.toContain('user')
  })
})
