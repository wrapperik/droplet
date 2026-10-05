import { createGeminiCaller, DEFAULT_FALLBACK_MODEL, DEFAULT_MODEL } from '../src/compose/gemini.ts'
import type { ModelCaller } from '../src/compose/compose.ts'

// The model, from the environment variables both servers read (the dev server from .env, the Supabase Edge Function from its secrets). The
// names are the same in both places, so what the dev server does is what the deployed function does. See .env.example.

export type ComposeEnv = Record<string, string | undefined>

export type ConfiguredCaller = {
  // Null when no API key is set.
  call: ModelCaller | null
  model: string
  fallbackModel: string | undefined
  // Which model gave the last answer, for the log.
  modelUsed: () => string | undefined
  limitPerHour: number
}

export function callerFromEnv(env: ComposeEnv): ConfiguredCaller {
  const apiKey = env.GEMINI_API_KEY?.trim()
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL
  const thinkingLevel = env.GEMINI_THINKING_LEVEL?.trim() || undefined
  // GEMINI_FALLBACK_MODEL=none turns the fallback off.
  const configuredFallback = env.GEMINI_FALLBACK_MODEL?.trim()
  const fallbackModel = configuredFallback === undefined || configuredFallback === '' ? DEFAULT_FALLBACK_MODEL : configuredFallback === 'none' ? undefined : configuredFallback
  let lastModel: string | undefined
  const call = apiKey ? createGeminiCaller({ apiKey, model, fallbackModel, thinkingLevel, onModelUsed: (used) => (lastModel = used) }) : null
  return { call, model, fallbackModel, modelUsed: () => lastModel, limitPerHour: Number(env.COMPOSE_LIMIT_PER_HOUR) || 60 }
}
