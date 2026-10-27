import { afterEach, describe, expect, it, vi } from 'vitest'
import { callerFromEnv } from './composeEnv.ts'

describe('the models and limits, from the environment', () => {
  it('uses Flash Lite for Quick and 3.8 Flash for Advanced, with 10 Advanced answers a day, unless told otherwise', () => {
    expect(callerFromEnv({})).toMatchObject({ call: null, baseModel: 'gemini-3.5-flash-lite', advancedModel: 'gemini-3.8-flash', advancedPerDay: 10, limitPerHour: 60 })
  })

  it('reads the new names', () => {
    const configured = callerFromEnv({ GEMINI_API_KEY: 'k', GEMINI_BASE_MODEL: 'quick-x', GEMINI_ADVANCED_MODEL: 'adv-y', COMPOSE_ADVANCED_PER_DAY: '4', COMPOSE_LIMIT_PER_HOUR: '30' })
    expect(configured).toMatchObject({ baseModel: 'quick-x', advancedModel: 'adv-y', advancedPerDay: 4, limitPerHour: 30 })
    expect(configured.call).not.toBeNull()
  })

  it('keeps GEMINI_MODEL as another name for the Advanced model, and prefers the new name', () => {
    expect(callerFromEnv({ GEMINI_MODEL: 'old-name' }).advancedModel).toBe('old-name')
    expect(callerFromEnv({ GEMINI_MODEL: 'old-name', GEMINI_ADVANCED_MODEL: 'new-name' }).advancedModel).toBe('new-name')
    expect(callerFromEnv({ GEMINI_MODEL: 'old-name' }).baseModel).toBe('gemini-3.5-flash-lite')
  })

  it('treats blank settings as unset, and 0 as Advanced turned off', () => {
    expect(callerFromEnv({ GEMINI_BASE_MODEL: '  ', GEMINI_ADVANCED_MODEL: '', COMPOSE_ADVANCED_PER_DAY: '' })).toMatchObject({ baseModel: 'gemini-3.5-flash-lite', advancedModel: 'gemini-3.8-flash', advancedPerDay: 10 })
    expect(callerFromEnv({ COMPOSE_ADVANCED_PER_DAY: '0' }).advancedPerDay).toBe(0)
    expect(callerFromEnv({ COMPOSE_ADVANCED_PER_DAY: '-3' }).advancedPerDay).toBe(0)
  })

  it('has no key without GEMINI_API_KEY, and never reports one', () => {
    expect(callerFromEnv({ GEMINI_API_KEY: ' ' }).call).toBeNull()
    expect(JSON.stringify(callerFromEnv({ GEMINI_API_KEY: 'SECRET' }))).not.toContain('SECRET')
  })
})

describe('choosing the provider', () => {
  it('is Gemini unless AI_PROVIDER says deepseek', () => {
    expect(callerFromEnv({ GEMINI_API_KEY: 'g' }).provider).toBe('gemini')
    expect(callerFromEnv({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' }).provider).toBe('gemini')
    expect(callerFromEnv({ AI_PROVIDER: 'something else', GEMINI_API_KEY: 'g' }).provider).toBe('gemini')
  })

  it('uses DeepSeek with its own key and model when asked, and ignores the Gemini settings', () => {
    const configured = callerFromEnv({ AI_PROVIDER: ' DeepSeek ', DEEPSEEK_API_KEY: 'd', DEEPSEEK_MODEL: 'deepseek-reasoner', GEMINI_API_KEY: 'g', GEMINI_BASE_MODEL: 'gemini-x' })
    expect(configured.provider).toBe('deepseek')
    expect(configured.call).not.toBeNull()
    expect(configured.baseModel).toBe('deepseek-reasoner')
    expect(configured.advancedModel).toBe('deepseek-reasoner')
  })

  it('defaults the DeepSeek model, offers no Advanced, and keeps the hourly limit', () => {
    const configured = callerFromEnv({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'd', COMPOSE_LIMIT_PER_HOUR: '30', COMPOSE_ADVANCED_PER_DAY: '10' })
    expect(configured.baseModel).toBe('deepseek-flash')
    expect(configured.advancedPerDay).toBe(0)
    expect(configured.limitPerHour).toBe(30)
  })

  it('has no caller with no key for either, and a DeepSeek key alone does not turn DeepSeek on', () => {
    expect(callerFromEnv({ AI_PROVIDER: 'deepseek' }).call).toBeNull()
    expect(callerFromEnv({ DEEPSEEK_API_KEY: 'd' }).call).toBeNull()
  })

  it('names Gemini as the fallback only when there is a Gemini key', () => {
    expect(callerFromEnv({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'd', GEMINI_API_KEY: 'g' }).fallback).toBe('gemini')
    expect(callerFromEnv({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'd' }).fallback).toBeUndefined()
    expect(callerFromEnv({ GEMINI_API_KEY: 'g' }).fallback).toBeUndefined()
  })
})

describe('Gemini behind DeepSeek', () => {
  const geminiReply = { candidates: [{ content: { parts: [{ text: '{"from":"gemini"}' }] }, finishReason: 'STOP' }] }
  const deepseekReply = { choices: [{ message: { content: '{"from":"deepseek"}' }, finish_reason: 'stop' }] }
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const textOf = (reply: unknown) => (typeof reply === 'string' ? reply : (reply as { text: string }).text)
  const ask = { system: 's', user: 'u', schema: {} }

  // Every request goes to the stub, by address: DeepSeek's as given, Gemini's always answering.
  const network = (deepseek: () => Response | Promise<Response>) => {
    const fetchStub = vi.fn(async (url: string | URL | Request) => (String(url).includes('deepseek') ? deepseek() : json(200, geminiReply)))
    vi.stubGlobal('fetch', fetchStub)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    return fetchStub
  }
  const hosts = (fetchStub: ReturnType<typeof network>) => fetchStub.mock.calls.map(([url]) => new URL(String(url)).host)

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('leaves Gemini alone while DeepSeek answers', async () => {
    const fetchStub = network(() => json(200, deepseekReply))
    const { call } = callerFromEnv({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'd', GEMINI_API_KEY: 'g' })
    expect(textOf(await call!(ask))).toBe('{"from":"deepseek"}')
    expect(hosts(fetchStub)).toEqual(['api.deepseek.com'])
  })

  it.each([
    ['has no balance', 402],
    ['refuses the key', 401],
    ['has a server error', 500],
  ])('answers with Gemini when DeepSeek %s', async (_why, status) => {
    const fetchStub = network(() => json(status, { error: { message: 'no' } }))
    const { call } = callerFromEnv({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'd', GEMINI_API_KEY: 'g' })
    expect(textOf(await call!(ask))).toBe('{"from":"gemini"}')
    expect(hosts(fetchStub)).toEqual(['api.deepseek.com', 'generativelanguage.googleapis.com'])
  })

  it('answers with Gemini when DeepSeek cannot be reached', async () => {
    network(() => Promise.reject(new TypeError('network down')))
    const { call } = callerFromEnv({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'd', GEMINI_API_KEY: 'g' })
    expect(textOf(await call!(ask))).toBe('{"from":"gemini"}')
  })

  it('answers everything with Gemini when DeepSeek has no key', async () => {
    const fetchStub = network(() => json(200, deepseekReply))
    const { call } = callerFromEnv({ AI_PROVIDER: 'deepseek', GEMINI_API_KEY: 'g' })
    expect(textOf(await call!(ask))).toBe('{"from":"gemini"}')
    expect(hosts(fetchStub)).toEqual(['generativelanguage.googleapis.com'])
  })

  it('says DeepSeek failed when there is no Gemini key to fall back on', async () => {
    network(() => json(500, {}))
    const { call } = callerFromEnv({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'd' })
    await expect(call!(ask)).rejects.toMatchObject({ kind: 'unavailable' })
  })
})

describe('web search for research', () => {
  it('is set up only when there is a Tavily key, with either provider', () => {
    expect(callerFromEnv({ GEMINI_API_KEY: 'g' }).search).toBeNull()
    expect(callerFromEnv({ GEMINI_API_KEY: 'g', TAVILY_API_KEY: 't' }).search).not.toBeNull()
    expect(callerFromEnv({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'd', TAVILY_API_KEY: 't' }).search).not.toBeNull()
    expect(callerFromEnv({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'd', TAVILY_API_KEY: '  ' }).search).toBeNull()
  })
})
