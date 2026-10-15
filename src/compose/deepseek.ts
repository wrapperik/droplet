import type { InlineFile } from './attachments.ts'
import { ComposeError, type ModelCaller, type ModelReply, type Usage } from './compose.ts'

// A second model provider, for when Gemini cannot be used (its free key has no billing, a quota is spent): DeepSeek, over its OpenAI-style chat API. It is
// chosen by AI_PROVIDER=deepseek (see composeEnv.ts) and meant as a stand-in. The key is passed in and sent only in a header; it is never put in a URL, a body
// or an error message. This file only ever runs on a server.
//
// What it does and does not do: it does not search the web. DeepSeek-V4.1-Flash reads pictures, sent as `image_url` blocks with a base64 data address (JPEG, PNG,
// GIF, WebP, from the API's own documentation). A PDF is sent as a `file` block with its base64 data, which is a guess from that documentation (it describes the
// block for images and does not say PDFs are accepted). If the API refuses a request that has files in it (a 400), it is sent once more without them, and the
// model is told it could not see them, so it says so instead of guessing. A text file is part of the prompt and always works.
// It is asked for JSON (the API's `json_object` mode, which does not take a schema), with the schema written into the instructions, and every reply is
// still checked by the same Zod schema and rules as a Gemini reply, with the same retry and fallback.

// DeepSeek-V4.1-Flash: the small, fast model of the V4.1 family (the older names `deepseek-chat` and `deepseek-reasoner` were retired in July 2026). It thinks by
// default, which is slow for a chat, so thinking is switched off here unless asked for.
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash'
export type DeepSeekThinking = 'disabled' | 'enabled'
export const DEFAULT_DEEPSEEK_THINKING: DeepSeekThinking = 'disabled'
const ENDPOINT = 'https://api.deepseek.com/chat/completions'
const DEFAULT_TIMEOUT_MS = 60_000
// A busy server (503) is tried once more after a short wait.
const OVERLOAD_RETRY_MS = 1500
// The longest reply asked for. A turn is a message, some actions and a few fields: well under this.
const MAX_TOKENS = 4096

export type DeepSeekOptions = {
  apiKey: string
  model?: string
  // Whether the model thinks before it answers. Off by default: much faster, and a turn is a short, structured answer. On, it also takes an effort.
  thinking?: DeepSeekThinking
  reasoningEffort?: 'low' | 'high' | 'max'
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

// How a file goes in the message: a picture by its data address, a PDF as a file block.
const blockOf = (file: InlineFile) =>
  file.mime === 'application/pdf'
    ? { type: 'file', file: { filename: 'attachment.pdf', file_data: `data:${file.mime};base64,${file.data}` } }
    : { type: 'image_url', image_url: { url: `data:${file.mime};base64,${file.data}` } }

// What is said in place of a picture or a PDF the model could not be given.
const unseen = (count: number) =>
  `\n\n<files_not_readable>\nThe founder attached ${count === 1 ? 'a picture or a PDF' : `${count} pictures or PDFs`}, which you could not be given this time. Say so plainly in your reply, do not guess what ${count === 1 ? 'it shows' : 'they show'}, and offer to help if they paste the words from ${count === 1 ? 'it' : 'them'} into the message.\n</files_not_readable>`

export function createDeepSeekCaller(options: DeepSeekOptions): ModelCaller {
  const { apiKey, model = DEFAULT_DEEPSEEK_MODEL, thinking = DEFAULT_DEEPSEEK_THINKING, reasoningEffort, endpoint = ENDPOINT, timeoutMs = DEFAULT_TIMEOUT_MS, overloadRetryMs = OVERLOAD_RETRY_MS, fetchImpl = fetch } = options

  // `files` are put in the user message beside the words: a picture as an image block, a PDF as a file block.
  const send = async (system: string, user: string, files: InlineFile[] = []): Promise<Response> => {
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
            { role: 'user', content: files.length === 0 ? user : [{ type: 'text', text: user }, ...files.map(blockOf)] },
          ],
          response_format: { type: 'json_object' },
          thinking: { type: thinking },
          ...(thinking === 'enabled' && reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
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
    const words = userWithoutSearch ?? user

    let response = await send(instructions, words, files)
    if (response.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, overloadRetryMs))
      response = await send(instructions, words, files)
    }
    // The API refused the request with the files in it (a PDF it does not take, or a picture it cannot read): once more without them, saying so to the model.
    if (response.status === 400 && files.length > 0) response = await send(instructions, `${words}${unseen(files.length)}`)

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
