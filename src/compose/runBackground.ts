import type { ModelCaller, ModelReply, ReplyMeta } from './compose.ts'
import { chatText, groundingProblems, summariseUser, summaryProblems, summarySchema, SUMMARISE_SYSTEM, type ChatSummary, type SummariseRequest } from './background.ts'
import { digestSchema, digestSource, digestUser, DIGEST_SYSTEM, type DigestRequest, type WorkspaceDigest } from './digest.ts'
import { modelSchemaOf } from './spec.ts'

// Asks the model for a background piece of work and checks what comes back, once more with the reasons if it is no good. Always Quick, and never with
// search. What cannot be trusted after the second try is nothing, not a worse answer: a memory that is wrong is worse than none.

const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/i

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text.trim().replace(FENCE, '$1'))
  } catch {
    return undefined
  }
}

export type BackgroundResult<T> = { value: T | null; meta?: ReplyMeta; problems: string[] }

export async function runSummarise(request: SummariseRequest, call: ModelCaller, alsoKnown: string[] = []): Promise<BackgroundResult<ChatSummary>> {
  const schema = modelSchemaOf(summarySchema)
  let errors: string[] = []
  let meta: ReplyMeta | undefined
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await call({ system: SUMMARISE_SYSTEM, user: summariseUser(request, attempt === 0 ? undefined : errors), schema, mode: 'base' })
    const reply: ModelReply = typeof raw === 'string' ? { text: raw } : raw
    meta = reply.meta ?? meta
    const parsed = summarySchema.safeParse(parse(reply.text))
    if (!parsed.success) {
      errors = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'reply'}: ${issue.message}`)
      continue
    }
    const problems = summaryProblems(parsed.data, chatText(request), alsoKnown)
    if (problems.length === 0) return { value: parsed.data, meta, problems: [] }
    errors = problems.map((problem) => `${problem}. Use only what is in the conversation.`)
  }
  return { value: null, meta, problems: errors }
}

// A digest of a workspace. The ideas it points to are checked to be among the items (one that is not is dropped, not an error), and every name and
// figure in the lines it wrote must be in the items.
export async function runDigest(request: DigestRequest, call: ModelCaller): Promise<BackgroundResult<WorkspaceDigest>> {
  const schema = modelSchemaOf(digestSchema)
  const refs = new Set(request.items.map((item) => item.ref))
  let errors: string[] = []
  let meta: ReplyMeta | undefined
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await call({ system: DIGEST_SYSTEM, user: digestUser(request, attempt === 0 ? undefined : errors), schema, mode: 'base' })
    const reply: ModelReply = typeof raw === 'string' ? { text: raw } : raw
    meta = reply.meta ?? meta
    const parsed = digestSchema.safeParse(parse(reply.text))
    if (!parsed.success) {
      errors = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'reply'}: ${issue.message}`)
      continue
    }
    const digest = { ...parsed.data, standouts: parsed.data.standouts.filter((entry) => refs.has(entry.ref)) }
    const problems = groundingProblems([digest.about, ...digest.decided, ...digest.open, ...digest.standouts.map((entry) => entry.reason)], digestSource(request), [], 'the items')
    if (problems.length === 0) return { value: digest, meta, problems: [] }
    errors = problems.map((problem) => `${problem}. Use only what is in the items.`)
  }
  return { value: null, meta, problems: errors }
}
