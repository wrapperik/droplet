import { ComposeError, type ModelCaller, type ModelReply, type Usage } from './compose.ts'

// A second model provider, for when Gemini cannot be used (its free key has no billing, a quota is spent): DeepSeek, over its OpenAI-style chat API. It is
// chosen by AI_PROVIDER=deepseek (see composeEnv.ts) and meant as a stand-in. The key is passed in and sent only in a header; it is never put in a URL, a body
// or an error message. This file only ever runs on a server.
//
// What it cannot do, on purpose and honestly: it does not search the web, and it cannot read a picture or a PDF (DeepSeek's chat models take text only). A text
// file attached to a message still works, since its words are part of the prompt. When a picture or a PDF comes, the model is told it cannot see it, so it says so.
// It is asked for JSON (the API's `json_object` mode, which does not take a schema), with the schema written into the instructions, and every reply is
// still checked by the same Zod schema and rules as a Gemini reply, with the same retry and fallback.

export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'
const ENDPOINT = 'https://api.deepseek.com/chat/completions'
const DEFAULT_TIMEOUT_MS = 60_000
// A busy server (503) is tried once more after a short wait.
const OVERLOAD_RETRY_MS = 1500
// The longest reply asked for. A turn is a message, some actions and a few fields: well under this.
const MAX_TOKENS = 4096

export type DeepSeekOptions = {
  apiKey: string
  model?: string
  // The API's address, for a compatible provider. Defaults to DeepSeek's own.
  endpoint?: string
  timeoutMs?: number
  overloadRetryMs?: number
  // Replaceable so tests never touch the network.
  fetchImpl?: typeof fetch
}

type ChatReply = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[]
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; completion_tokens_details?: { reasoning_tokens?: unknown } }
  error?: { message?: string; type?: string }
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0)

function readUsage(reply: ChatReply): Usage | undefined {
  if (!reply.usage) return undefined
  return { prompt: count(reply.usage.prompt_tokens), answer: count(reply.usage.completion_tokens), thinking: count(reply.usage.completion_tokens_details?.reasoning_tokens) }
}

// What is said in place of a picture or a PDF the model cannot see.
const unseen = (count: number) =>
  `\n\n<files_not_readable>\nThe founder attached ${count === 1 ? 'a picture or a PDF' : `${count} pictures or PDFs`}, which you cannot see or read in this mode. Say so plainly in your reply, do not guess what ${count === 1 ? 'it shows' : 'they show'}, and offer to help if they paste the words from ${count === 1 ? 'it' : 'them'} into the message.\n</files_not_readable>`

export function createDeepSeekCaller(options: DeepSeekOptions): ModelCaller {
  const { apiKey, model = DEFAULT_DEEPSEEK_MODEL, endpoint = ENDPOINT, timeoutMs = DEFAULT_TIMEOUT_MS, overloadRetryMs = OVERLOAD_RETRY_MS, fetchImpl = fetch } = options

  const send = async (system: string, user: string): Promise<Response> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
          max_tokens: MAX_TOKENS,
          stream: false,
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

  return async ({ system, user, schema, userWithoutSearch, files = [] }): Promise<ModelReply> => {
    // JSON mode needs the word "json" and the shape asked for in the instructions: the schema is written into them. DeepSeek never searches, so the version
    // of the request that says search is not available is the one it is given.
    const instructions = `${system}\n\nReply with only a JSON object that matches this JSON schema, and nothing else:\n${JSON.stringify(schema)}`
    const words = `${userWithoutSearch ?? user}${files.length > 0 ? unseen(files.length) : ''}`

    let response = await send(instructions, words)
    if (response.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, overloadRetryMs))
      response = await send(instructions, words)
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ChatReply
      const detail = (body.error?.message ?? '').slice(0, 200)
      if (response.status === 401) throw new ComposeError('bad_key', 'The DeepSeek API key was refused.')
      // 402 is "insufficient balance": the account has no credit left. It is a quota in the sense that matters: nothing works until it is topped up.
      if (response.status === 402) throw new ComposeError('quota', 'The DeepSeek account has no balance left. Top it up, or switch AI_PROVIDER back to gemini.')
      if (response.status === 404) throw new ComposeError('bad_model', `The model "${model}" was not found.`)
      if (response.status === 429) throw new ComposeError('rate_limited', 'The model is receiving too many requests.')
      if (response.status >= 500) throw new ComposeError('unavailable', 'The model is not available right now.')
      throw new ComposeError('bad_request', detail || `The model rejected the request (${response.status}).`)
    }

    const reply = (await response.json()) as ChatReply
    const choice = reply.choices?.[0]
    if (choice?.finish_reason === 'content_filter') throw new ComposeError('blocked', 'The model declined that request.')
    const usage = readUsage(reply)
    return { text: choice?.message?.content ?? '', meta: { model, answeredBy: 'base', ...(usage ? { usage } : {}) } }
  }
}
