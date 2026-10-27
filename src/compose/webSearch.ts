import { z } from 'zod'
import { containsPrivateDetail } from '../lib/facts.ts'
import type { ModelCaller } from './compose.ts'
import type { Grounding } from './grounding.ts'
import type { ComposeRequest } from './spec.ts'

// Web search for research: when a founder asks Droplet to research something or to do a competitive analysis, the server searches the web (Tavily) and gives the
// model what it found to read. It works with any model, since the search is done here and not by the model, and it is how DeepSeek can look things up at all.
//
// Rules the code keeps:
// - A search only happens when the founder's own words ask for research. The model does not decide to search, and nothing in the app searches in the background.
// - The searches are written for the research, not copied from the message: a small model call turns the request, what the business does and where, and the
//   conversation into two or three specific queries (planQueries). If that fails, the message itself is the query (queryFor). A message with a private detail in
//   it (an email, a phone number, an address, a bank detail) is not searched at all, and a planned query with one in it is dropped.
// - What comes back is information, never instructions, and the sources listed under the reply are the ones the search returned, never ones the model named.
//
// Kept free of anything from the interface, so the server and the tests can use it.

export type WebResult = { title: string; url: string; snippet: string }
export type WebResults = { queries: string[]; results: WebResult[] }
// What the model is told about a search: what was found, or that none was done and why.
export type WebSearched = WebResults | { refused: string }

// What the server needs of a search service: a query in, a few results out. Throws if the service cannot be reached.
export type WebSearcher = (query: string) => Promise<WebResult[]>

const RESEARCH = /\b(research|researching|competitors?|competitive|competition|competing|market (?:research|analysis|size|landscape)|industry (?:analysis|trends?)|benchmark(?:ing)?|look (?:it |this |that |them )?up|look into|find out (?:about|what|who|how|if|whether)|what(?:'s| is| are) (?:the )?(?:latest|current)|latest trends?|alternatives to|similar (?:businesses|companies|products)|who else (?:sells|does|offers|uses)|going rates?|search (?:for|online|the web|the internet|google)|google (?:it|that|this)|check (?:online|the web|if|whether)|(?:already )?(?:taken|registered|trademarked|in use)\b.{0,40}\?|(?:is|are) (?:the name |the names )?.{1,40} (?:taken|available|free to use|registered|trademarked|in use)|(?:anyone|anybody|another business|other businesses|someone) (?:else )?(?:called|named|using)|name (?:check|search|availability))\b/i

// Whether the founder asked for research, in their own words.
export const wantsResearch = (text: string) => RESEARCH.test(text)

export const MAX_QUERY_CHARS = 200
const MAX_RESULTS = 4
const MAX_SNIPPET_CHARS = 500

// The query to search for, or null when there should be no search: no message, or a private detail in it. A short message borrows what the founder confirmed
// about the business (what it does, where) so "do a competitive analysis" is about their business and not about the word.
export function queryFor(intent: string, facts: { what?: string; where?: string } = {}): { query: string } | { refused: string } {
  const said = intent
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (said === '') return { refused: 'There is nothing to search for.' }
  if (containsPrivateDetail(said)) return { refused: 'Your message has a private detail in it (an email, a phone number, an address or a bank detail), so I did not search the web with it.' }
  const borrowed = said.length < 70 ? [facts.what, facts.where].filter((fact): fact is string => Boolean(fact) && !containsPrivateDetail(fact!)) : []
  const query = [said, ...borrowed].join(' ').slice(0, MAX_QUERY_CHARS).trim()
  return { query }
}

const isHttps = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  try {
    return new URL(value).protocol === 'https:' && value.length <= 2000
  } catch {
    return false
  }
}

type TavilyReply = { results?: { title?: unknown; url?: unknown; content?: unknown }[] }

// Tavily's search API over plain HTTP. The key is sent in a header only and never put in a URL or an error.
export function createTavilySearch(options: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number }): WebSearcher {
  const { apiKey, fetchImpl = fetch, timeoutMs = 15_000 } = options
  return async (query) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query, search_depth: 'basic', max_results: MAX_RESULTS, include_answer: false }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`search failed (${response.status})`)
      const body = (await response.json()) as TavilyReply
      return (body.results ?? []).flatMap((item): WebResult[] =>
        isHttps(item.url) && typeof item.title === 'string' && typeof item.content === 'string' && item.content.trim() !== ''
          ? [{ title: item.title.trim().slice(0, 200) || new URL(item.url).hostname, url: item.url, snippet: item.content.replace(/\s+/g, ' ').trim().slice(0, MAX_SNIPPET_CHARS) }]
          : [],
      ).slice(0, MAX_RESULTS)
    } finally {
      clearTimeout(timer)
    }
  }
}

// What a reply that used a search carries beside its words: the query, and the pages, from the search itself.
export const groundingOfSearch = (found: WebResults): Grounding => ({ queries: found.queries, sources: found.results.map((result) => ({ title: result.title, url: result.url })), via: 'web' })

// ---- Planning the searches ----

export const MAX_QUERIES_PLANNED = 3
const MAX_PLANNED_CHARS = 120

const planSchema = z.object({
  queries: z.array(z.string().trim().min(3).max(MAX_PLANNED_CHARS)).min(1).max(MAX_QUERIES_PLANNED),
})
export const planJsonSchema = z.toJSONSchema(planSchema) as Record<string, unknown>

export const PLANNER_SYSTEM = `You write web searches for a small business owner who has asked Droplet to research something. Reply with only a JSON object: { "queries": [...] }.
- Write two or three different searches that together would find what they need. Do not copy their message: turn it into what a person searching would type, using what the business does, who it is for and where it works.
- Be specific. For competitors, search for the kind of business and the place ("small web development studios Pretoria", "custom software packages for small businesses South Africa pricing"). For prices, search for what is charged ("freelance web developer rates South Africa 2026"). For trends, name the industry and the place.
- Default to South Africa when no place is given, and use South African words and rand where it helps.
- Each search is at most ${MAX_PLANNED_CHARS} characters, plain words, no quotation marks and no operators.
- Never include a person's name, a client's name, an email address, a phone number, an address or a bank detail. Do not include the business's own name unless they asked you to look up that specific business, or to check whether a name is free.
- To check whether a name is free, search for the name itself: as a registered company in South Africa (CIPC), as a trade mark, and as a business trading under it ("Rework consulting South Africa", "Rework CIPC company registration").
- Make the searches different from each other (for example one about competitors, one about prices, one about the market), not three versions of the same one.`

// What the planner is given: the request, what the business does, and the last few messages. Only what the searches need, with angle brackets taken out so none of it
// can close a tag, and no fact that holds a private detail.
export function buildPlannerContent(request: Pick<ComposeRequest, 'intent' | 'history' | 'project'>): string {
  const clean = (text: string) => text.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim()
  const facts = request.project?.facts ?? {}
  const business = (['profile.what', 'profile.who_for', 'profile.where', 'business.offer', 'business.pricing', 'brand.values'] as const)
    .flatMap((key) => (facts[key] && !containsPrivateDetail(facts[key]!) ? [`${key.split('.')[1]}: ${clean(facts[key]!)}`] : []))
  const offer = request.project?.offer && !containsPrivateDetail(request.project.offer) ? [`offer: ${clean(request.project.offer)}`] : []
  const talk = (request.history ?? []).slice(-4).map((message) => `${message.role === 'founder' ? 'Founder' : 'Droplet'}: ${clean(message.text).slice(0, 300)}`)
  return [
    `<business>\n${[...business, ...offer].join('\n') || 'nothing is known yet'}\n</business>`,
    ...(talk.length > 0 ? [`<conversation>\n${talk.join('\n')}\n</conversation>`] : []),
    `<request>\n${clean(request.intent)}\n</request>`,
  ].join('\n\n')
}

// The searches to run, written for the research. Null when the model could not be asked or gave nothing usable, in which case the caller falls back to the
// founder's own words. A query with a private detail in it is dropped, and the rest are tidied and made different from each other.
export async function planQueries(call: ModelCaller, request: Pick<ComposeRequest, 'intent' | 'history' | 'project'>): Promise<string[] | null> {
  let text: string
  try {
    const reply = await call({ system: PLANNER_SYSTEM, user: buildPlannerContent(request), schema: planJsonSchema, mode: 'base', search: false })
    text = typeof reply === 'string' ? reply : reply.text
  } catch {
    return null
  }
  let data: unknown
  try {
    data = JSON.parse(text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1'))
  } catch {
    return null
  }
  const parsed = planSchema.safeParse(data)
  if (!parsed.success) return null
  const seen = new Set<string>()
  const queries = parsed.data.queries
    .map((query) => query.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim())
    .filter((query) => query !== '' && !containsPrivateDetail(query))
    .filter((query) => (seen.has(query.toLowerCase()) ? false : (seen.add(query.toLowerCase()), true)))
  return queries.length > 0 ? queries.slice(0, MAX_QUERIES_PLANNED) : null
}

// Results from several searches as one list: taken in turn from each search so every query is heard, the same page once, and at most `limit` in all.
export function mergeResults(lists: WebResult[][], limit = 8): WebResult[] {
  const merged: WebResult[] = []
  const seen = new Set<string>()
  for (let round = 0; merged.length < limit && lists.some((list) => round < list.length); round += 1) {
    for (const list of lists) {
      const item = list[round]
      if (!item || merged.length >= limit) continue
      const key = item.url.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(item)
    }
  }
  return merged
}
