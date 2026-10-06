import { ComposeError, type ModelCaller, type ModelReply, type Usage } from './compose.ts'
import { groundingFromMetadata } from './grounding.ts'

// Calls the Gemini API over REST. The key is passed in and sent only in a header; it is never put in a URL, a
// body or an error message. This file only ever runs on a server.
//
// The model ID is configuration, not code: the pitch pins it and only changes it after the fixed test requests
// have been run again (see `npm run eval:compose`).

// Quick, the default for every message: a small, fast model that never searches and has no spare.
export const DEFAULT_BASE_MODEL = 'gemini-3.5-flash-lite'
export const DEFAULT_BASE_THINKING = 'low'
// Advanced, which the founder chooses for one message: a stronger model that can search the web. When Google cannot answer with it (its quota is used
// up, or it is overloaded) the request is answered by the Quick model instead.
export const DEFAULT_ADVANCED_MODEL = 'gemini-3.8-flash'
// The models that can use Google Search and answer in the JSON schema in the same request. Others are asked without search.
export const SEARCH_MODELS = ['gemini-3.8-flash', 'gemini-3.1-pro-preview']
export const canSearch = (model: string) => SEARCH_MODELS.includes(model)
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_TIMEOUT_MS = 45_000
// The free tier is often briefly overloaded (503). One more try after a short wait usually gets through.
const OVERLOAD_RETRY_MS = 1500
// If a used-up quota does not say when it resets, assume an hour before trying that model again.
const DEFAULT_BLOCK_SECONDS = 3600
// When the API refuses Google Search (a 400, or a 429 for the search quota), do not ask it for search again for this long.
const SEARCH_BLOCK_MS = 60 * 60 * 1000

export type GeminiOptions = {
  apiKey: string
  // Answers every Quick request, and any Advanced request Google's stronger model cannot answer.
  baseModel?: string
  // Answers Advanced requests, with Google Search.
  advancedModel?: string
  // How hard each model thinks before answering (for Gemini 3 models: for example "low"). Unset leaves it to the API, which is the most careful and
  // the slowest. Quick defaults to low.
  baseThinking?: string
  advancedThinking?: string
  timeoutMs?: number
  overloadRetryMs?: number
  now?: () => number
  // Replaceable so tests never touch the network.
  fetchImpl?: typeof fetch
}

type GeminiReply = {
  usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown; thoughtsTokenCount?: unknown }
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string; groundingMetadata?: unknown }[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string; details?: { violations?: { quotaId?: string }[]; retryDelay?: string }[] }
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0)

// The tokens a reply used, if the API says. Logged, never shown to founders.
function readUsage(reply: GeminiReply): Usage | undefined {
  const raw = reply.usageMetadata
  if (!raw) return undefined
  return { prompt: count(raw.promptTokenCount), answer: count(raw.candidatesTokenCount), thinking: count(raw.thoughtsTokenCount) }
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

// One model, asked over REST. Always answers with a ModelReply whose meta says the model and the tokens used.
type OneModel = (request: Parameters<ModelCaller>[0]) => Promise<ModelReply>

function createModelCaller(options: GeminiOptions, model: string, thinkingLevel: string | undefined): OneModel {
  const { apiKey, timeoutMs = DEFAULT_TIMEOUT_MS, overloadRetryMs = OVERLOAD_RETRY_MS, fetchImpl = fetch, now = Date.now } = options
  // If the API will not take the schema as a field, carry on with the schema written into the prompt.
  let schemaAccepted = true
  // If the API will not take Google Search with this model (or this key), carry on without it for a while, and then try again.
  let searchBlockedUntil = 0
  // The schema of the request in hand, so it can be written into the prompt if the API will not take it as a field.
  let schemaFallback: Record<string, unknown> = {}

  const send = async (system: string, user: string, schema: Record<string, unknown> | null, search: boolean): Promise<Response> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: schema ? system : `${system}\n\nReply with only JSON that matches this JSON schema:\n${JSON.stringify(schemaFallback)}` }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          // Google Search is the only tool, and only when this request may search. The model decides whether to use it.
          ...(search ? { tools: [{ googleSearch: {} }] } : {}),
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

  return async ({ system, user, schema, search = false, userWithoutSearch }) => {
    schemaFallback = schema
    // Whether search was asked for and the API refused it, for the log.
    let searchRefused = search && !canSearch(model)
    const searching = () => search && canSearch(model) && now() >= searchBlockedUntil
    if (search && canSearch(model) && !searching()) searchRefused = true
    // Asked without search, the model is told it cannot search, so it never claims to have looked something up.
    const plainUser = userWithoutSearch ?? user
    let response = await send(system, searching() ? user : plainUser, schemaAccepted ? schema : null, searching())

    if (response.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, overloadRetryMs))
      response = await send(system, searching() ? user : plainUser, schemaAccepted ? schema : null, searching())
    }

    // A 400 with search on may be search, which a model or a key may not allow, and a 429 may be search's own quota (the same request without search
    // works). Try once without it on the same model, and only remember that if it works.
    // A 429 for the model's own daily quota is not search's doing, and the same request without search would be refused the same way.
    const searchWasRefused = async () => response.status === 400 || (response.status === 429 && !readQuota((await response.clone().json().catch(() => ({}))) as GeminiReply).daily)
    if (searching() && (await searchWasRefused())) {
      const retry = await send(system, plainUser, schemaAccepted ? schema : null, false)
      if (retry.ok) {
        searchBlockedUntil = now() + SEARCH_BLOCK_MS
        searchRefused = true
      }
      response = retry
    }

    // A 400 with a schema may be the schema, which the API can refuse for reasons it does not explain. Try once
    // without it, with the schema written into the prompt instead, and only remember that if the retry works.
    if (response.status === 400 && schemaAccepted) {
      const retry = await send(system, plainUser, null, false)
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
    const text = (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('')
    const grounding = groundingFromMetadata(candidate?.groundingMetadata)
    const usage = readUsage(reply)
    return {
      text,
      ...(grounding ? { grounding } : {}),
      // answeredBy is filled in by the caller that chose this model.
      meta: { model, answeredBy: 'base', ...(searchRefused ? { searchRefused: true } : {}), ...(usage ? { usage } : {}) },
    }
  }
}

export function createGeminiCaller(options: GeminiOptions): ModelCaller {
  const baseModel = options.baseModel ?? DEFAULT_BASE_MODEL
  const advancedModel = options.advancedModel ?? DEFAULT_ADVANCED_MODEL
  const base = createModelCaller(options, baseModel, options.baseThinking ?? DEFAULT_BASE_THINKING)
  const advanced = createModelCaller(options, advancedModel, options.advancedThinking)
  const now = options.now ?? Date.now
  // When Advanced's daily quota is used up there is no point asking it again until it resets.
  let advancedBlockedUntil = 0

  const answeredBy = (reply: ModelReply, mode: 'base' | 'advanced', spared = false): ModelReply => ({
    ...reply,
    meta: { ...(reply.meta ?? { model: mode === 'base' ? baseModel : advancedModel }), answeredBy: mode, ...(spared ? { spared: true } : {}) },
  })

  return async (request) => {
    // Quick never searches and has no other model to turn to.
    if (request.mode !== 'advanced') return answeredBy(await base({ ...request, search: false }), 'base')

    // Google's stronger model cannot answer, so Quick does, without search. The request is told it cannot search so it never claims to have looked.
    const askQuick = async () => answeredBy(await base({ ...request, search: false }), 'base', true)
    const canFallBack = advancedModel !== baseModel
    if (canFallBack && now() < advancedBlockedUntil) return askQuick()
    try {
      return answeredBy(await advanced(request), 'advanced')
    } catch (error) {
      const worthTrying = error instanceof ComposeError && (error.kind === 'quota' || error.kind === 'rate_limited' || error.kind === 'unavailable')
      if (!canFallBack || !worthTrying) throw error
      if (error.kind === 'quota') advancedBlockedUntil = now() + (error.retryAfterSeconds ?? DEFAULT_BLOCK_SECONDS) * 1000
      return askQuick()
    }
  }
}
