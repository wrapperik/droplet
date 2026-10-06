import { createGeminiCaller, DEFAULT_ADVANCED_MODEL, DEFAULT_BASE_MODEL, DEFAULT_BASE_THINKING } from '../src/compose/gemini.ts'
import type { ModelCaller } from '../src/compose/compose.ts'

// The models and limits, from the environment variables both servers read (the dev server from .env, the Supabase Edge Function from its secrets). The
// names are the same in both places, so what the dev server does is what the deployed function does. See .env.example.

export type ComposeEnv = Record<string, string | undefined>

export const DEFAULT_ADVANCED_PER_DAY = 10

export type ConfiguredCaller = {
  // Null when no API key is set.
  call: ModelCaller | null
  // Quick: every message unless the founder chooses Advanced.
  baseModel: string
  // Advanced: a stronger model with Google Search, for one message at a time, a few a day.
  advancedModel: string
  limitPerHour: number
  // Advanced answers a founder may have in a day (COMPOSE_ADVANCED_PER_DAY). 0 turns Advanced off.
  advancedPerDay: number
}

const text = (value: string | undefined) => value?.trim() || undefined

export function callerFromEnv(env: ComposeEnv): ConfiguredCaller {
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
  return { call, baseModel, advancedModel, limitPerHour: Number(env.COMPOSE_LIMIT_PER_HOUR) || 60, advancedPerDay }
}
