import { createGeminiCaller, DEFAULT_ADVANCED_MODEL, DEFAULT_BASE_MODEL, DEFAULT_BASE_THINKING } from '../src/compose/gemini.ts'
import { createDeepSeekCaller, DEFAULT_DEEPSEEK_MODEL, type DeepSeekThinking } from '../src/compose/deepseek.ts'
import type { ModelCaller } from '../src/compose/compose.ts'
import { withFallback } from '../src/compose/providerFallback.ts'
import { createTavilySearch, type WebSearcher } from '../src/compose/webSearch.ts'

// The models and limits, from the environment variables both servers read (the dev server from .env, the Supabase Edge Function from its secrets). The
// names are the same in both places, so what the dev server does is what the deployed function does. See .env.example.

export type ComposeEnv = Record<string, string | undefined>

export const DEFAULT_ADVANCED_PER_DAY = 10

// Which service answers: Gemini (the default), or DeepSeek (AI_PROVIDER=deepseek, with DEEPSEEK_API_KEY). With DeepSeek, Gemini is the fallback when a
// GEMINI_API_KEY is set as well: a request DeepSeek cannot answer goes to Gemini's Quick model, and so does every request if DeepSeek has no key.
export type Provider = 'gemini' | 'deepseek'

export type ConfiguredCaller = {
  provider: Provider
  // The provider that answers when the first cannot. Only Gemini, behind DeepSeek.
  fallback?: Provider
  // Null when no API key is set for the provider in use.
  call: ModelCaller | null
  // Quick: every message unless the founder chooses Advanced.
  baseModel: string
  // Advanced: a stronger model with Google Search, for one message at a time, a few a day.
  advancedModel: string
  limitPerHour: number
  // Searches the web for research (TAVILY_API_KEY). Null when there is no key.
  search: WebSearcher | null
  // Advanced answers a founder may have in a day (COMPOSE_ADVANCED_PER_DAY). 0 turns Advanced off.
  advancedPerDay: number
}

const text = (value: string | undefined) => value?.trim() || undefined

export function callerFromEnv(env: ComposeEnv): ConfiguredCaller {
  const tavilyKey = text(env.TAVILY_API_KEY)
  const search = tavilyKey ? createTavilySearch({ apiKey: tavilyKey }) : null
  const provider: Provider = text(env.AI_PROVIDER)?.toLowerCase() === 'deepseek' ? 'deepseek' : 'gemini'
  const limitPerHour = Number(env.COMPOSE_LIMIT_PER_HOUR) || 60
  if (provider === 'deepseek') {
    // One model, so no Advanced (its allowance is 0 and the menu does not offer it). Quick and Advanced are both this model. Research is searched with
    // Tavily, as with Gemini.
    const apiKey = text(env.DEEPSEEK_API_KEY)
    const model = text(env.DEEPSEEK_MODEL) ?? DEFAULT_DEEPSEEK_MODEL
    // DEEPSEEK_THINKING=enabled lets it think first (slower, more careful), with DEEPSEEK_REASONING_EFFORT of low, high or max.
    const thinking: DeepSeekThinking | undefined = text(env.DEEPSEEK_THINKING)?.toLowerCase() === 'enabled' ? 'enabled' : undefined
    const effort = text(env.DEEPSEEK_REASONING_EFFORT)?.toLowerCase()
    const reasoningEffort = effort === 'low' || effort === 'high' || effort === 'max' ? effort : undefined
    const deepseek = apiKey ? createDeepSeekCaller({ apiKey, model, ...(thinking ? { thinking } : {}), ...(reasoningEffort ? { reasoningEffort } : {}) }) : null
    // Gemini behind it, on its Quick model, when there is a key for it.
    const geminiKey = text(env.GEMINI_API_KEY)
    const gemini = geminiKey ? createGeminiCaller({ apiKey: geminiKey, baseModel: text(env.GEMINI_BASE_MODEL) ?? DEFAULT_BASE_MODEL, baseThinking: text(env.GEMINI_BASE_THINKING) ?? DEFAULT_BASE_THINKING }) : null
    const call = deepseek && gemini ? withFallback({ name: 'DeepSeek', call: deepseek }, { name: 'Gemini', call: gemini }) : (deepseek ?? gemini)
    return { provider, ...(gemini ? { fallback: 'gemini' as const } : {}), call, baseModel: model, advancedModel: model, limitPerHour, search, advancedPerDay: 0 }
  }
  const apiKey = text(env.GEMINI_API_KEY)
  const baseModel = text(env.GEMINI_BASE_MODEL) ?? DEFAULT_BASE_MODEL
  // GEMINI_MODEL is the older name for the model that answers the hard requests, which is now Advanced.
  const advancedModel = text(env.GEMINI_ADVANCED_MODEL) ?? text(env.GEMINI_MODEL) ?? DEFAULT_ADVANCED_MODEL
  const baseThinking = text(env.GEMINI_BASE_THINKING) ?? DEFAULT_BASE_THINKING
  // GEMINI_THINKING_LEVEL is the older name for how hard Advanced thinks.
  const advancedThinking = text(env.GEMINI_ADVANCED_THINKING) ?? text(env.GEMINI_THINKING_LEVEL)
  const call = apiKey ? createGeminiCaller({ apiKey, baseModel, advancedModel, baseThinking, advancedThinking }) : null
  const setting = text(env.COMPOSE_ADVANCED_PER_DAY)
  const advancedPerDay = setting === undefined ? DEFAULT_ADVANCED_PER_DAY : Math.max(0, Math.floor(Number(setting) || 0))
  return { provider, call, baseModel, advancedModel, limitPerHour, search, advancedPerDay }
}
