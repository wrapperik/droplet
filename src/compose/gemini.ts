import { ComposeError, type ModelCaller } from './compose.ts'

// Calls the Gemini API over REST. The key is passed in and sent only in a header; it is never put in a URL, a
// body or an error message. This file only ever runs on a server.
//
// The model ID is configuration, not code: the pitch pins it and only changes it after the fixed test requests
// have been run again (see `npm run eval:compose`).

export const DEFAULT_MODEL = 'gemini-3.8-flash'
// Used only when the main model cannot answer because its quota is used up or it is overloaded. Each model has its
// own free quota, so this keeps things working. The model that answered is logged with every request.
export const DEFAULT_FALLBACK_MODEL = 'gemini-3.5-flash-lite'
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_TIMEOUT_MS = 45_000
// The free tier is often briefly overloaded (503). One more try after a short wait usually gets through.
const OVERLOAD_RETRY_MS = 1500
// If a used-up quota does not say when it resets, assume an hour before trying that model again.
const DEFAULT_BLOCK_SECONDS = 3600

export type GeminiOptions = {
  apiKey: string
  model?: string
  // Tried instead when the main model's quota is used up or it stays overloaded. None if unset.
  fallbackModel?: string
  timeoutMs?: number
  overloadRetryMs?: number
  // How hard the model thinks before answering (for Gemini 3 models: for example "low"). Unset leaves it to the API,
  // which is the most careful and the slowest.
  thinkingLevel?: string
  // Told which model gave each answer.
  onModelUsed?: (model: string) => void
  now?: () => number
  // Replaceable so tests never touch the network.
  fetchImpl?: typeof fetch
}

type GeminiReply = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string; details?: { violations?: { quotaId?: string }[]; retryDelay?: string }[] }
}

// A 429 is either "too many requests this minute" (wait a moment) or "the free quota for the day is used up" (wait
// for hours). They need different words, so the quota detail in the reply is read.
function readQuota(body: GeminiReply): { daily: boolean; retryAfterSeconds?: number } {
  const details = body.error?.details ?? []
  const daily = details.some((d) => d.violations?.some((v) => /PerDay/i.test(v.quotaId ?? '')))
  const delay = details.map((d) => d.retryDelay).find((value) => value)
  const seconds = delay ? Number.parseFloat(delay) : Number.NaN
  return { daily, retryAfterSeconds: Number.isFinite(seconds) ? Math.ceil(seconds) : undefined }
}

const hoursText = (seconds?: number) => {
  if (!seconds) return 'later today'
  const hours = Math.round(seconds / 3600)
  return hours >= 1 ? `in about ${hours} ${hours === 1 ? 'hour' : 'hours'}` : 'within the hour'
}

function createModelCaller(options: GeminiOptions, model: string): ModelCaller {
  const { apiKey, timeoutMs = DEFAULT_TIMEOUT_MS, overloadRetryMs = OVERLOAD_RETRY_MS, thinkingLevel, fetchImpl = fetch } = options
  // If the API will not take the schema as a field, carry on with the schema written into the prompt.
  let schemaAccepted = true
  // The schema of the request in hand, so it can be written into the prompt if the API will not take it as a field.
  let schemaFallback: Record<string, unknown> = {}

  const send = async (system: string, user: string, schema: Record<string, unknown> | null): Promise<Response> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: schema ? system : `${system}\n\nReply with only JSON that matches this JSON schema:\n${JSON.stringify(schemaFallback)}` }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            ...(schema ? { responseJsonSchema: schema } : {}),
            ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
          },
        }),
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new ComposeError('timeout', 'The model took too long to answer.')
      throw new ComposeError('unavailable', 'The model could not be reached.')
    } finally {
      clearTimeout(timer)
    }
  }

  return async ({ system, user, schema }) => {
    schemaFallback = schema
    let response = await send(system, user, schemaAccepted ? schema : null)

    if (response.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, overloadRetryMs))
      response = await send(system, user, schemaAccepted ? schema : null)
    }

    // A 400 with a schema may be the schema, which the API can refuse for reasons it does not explain. Try once
    // without it, with the schema written into the prompt instead, and only remember that if the retry works.
    if (response.status === 400 && schemaAccepted) {
      const retry = await send(system, user, null)
      if (retry.ok) schemaAccepted = false
      response = retry
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as GeminiReply
      const detail = (body.error?.message ?? '').slice(0, 200)
      if (response.status === 401 || response.status === 403) throw new ComposeError('bad_key', 'The Gemini API key was refused.')
      if (response.status === 404) throw new ComposeError('bad_model', `The model "${model}" was not found.`)
      if (response.status === 429) {
        const quota = readQuota(body)
        if (quota.daily) {
          throw new ComposeError('quota', `The free daily limit for ${model} is used up. It resets ${hoursText(quota.retryAfterSeconds)}.`, quota.retryAfterSeconds)
        }
        throw new ComposeError('rate_limited', 'The model is receiving too many requests.', quota.retryAfterSeconds)
      }
      if (response.status >= 500) throw new ComposeError('unavailable', 'The model is not available right now.')
      throw new ComposeError('bad_request', detail || `The model rejected the request (${response.status}).`)
    }

    const reply = (await response.json()) as GeminiReply
    if (reply.promptFeedback?.blockReason) throw new ComposeError('blocked', 'The model declined that request.')
    const candidate = reply.candidates?.[0]
    if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
      throw new ComposeError('blocked', 'The model declined that request.')
    }
    // Reasoning parts, if the model sends any, are not the answer.
    return (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('')
  }
}

export function createGeminiCaller(options: GeminiOptions): ModelCaller {
  const model = options.model ?? DEFAULT_MODEL
  const fallbackModel = options.fallbackModel && options.fallbackModel !== model ? options.fallbackModel : null
  const main = createModelCaller(options, model)
  const spare = fallbackModel ? createModelCaller(options, fallbackModel) : null
  const now = options.now ?? Date.now
  // When the main model's daily quota is used up there is no point asking it again until it resets.
  let mainBlockedUntil = 0

  return async (request) => {
    if (spare && fallbackModel && now() < mainBlockedUntil) {
      const text = await spare(request)
      options.onModelUsed?.(fallbackModel)
      return text
    }
    try {
      const text = await main(request)
      options.onModelUsed?.(model)
      return text
    } catch (error) {
      const worthTrying = error instanceof ComposeError && (error.kind === 'quota' || error.kind === 'rate_limited' || error.kind === 'unavailable')
      if (!spare || !fallbackModel || !worthTrying) throw error
      if (error.kind === 'quota') mainBlockedUntil = now() + (error.retryAfterSeconds ?? DEFAULT_BLOCK_SECONDS) * 1000
      const text = await spare(request)
      options.onModelUsed?.(fallbackModel)
      return text
    }
  }
}
