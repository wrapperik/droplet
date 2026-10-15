import { describe, expect, it } from 'vitest'
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

  it('has no caller without its own key: a Gemini key does not stand in for a DeepSeek one', () => {
    expect(callerFromEnv({ AI_PROVIDER: 'deepseek', GEMINI_API_KEY: 'g' }).call).toBeNull()
    expect(callerFromEnv({ DEEPSEEK_API_KEY: 'd' }).call).toBeNull()
  })
})
