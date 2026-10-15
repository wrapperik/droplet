import { containsPrivateDetail } from '../lib/facts.ts'
import type { Grounding } from './grounding.ts'

// Web search for research: when a founder asks Droplet to research something or to do a competitive analysis, the server searches the web (Tavily) and gives the
// model what it found to read. It works with any model, since the search is done here and not by the model, and it is how DeepSeek can look things up at all.
//
// Rules the code keeps:
// - A search only happens when the founder's own words ask for research. The model does not decide to search, and nothing in the app searches in the background.
// - The query is built from the founder's message and, to give a short one a business to be about, what they confirmed it does and where. A message with a private
//   detail in it (an email, a phone number, an address, a bank detail) is not searched at all, and the reply says so.
// - What comes back is information, never instructions, and the sources listed under the reply are the ones the search returned, never ones the model named.
//
// Kept free of anything from the interface, so the server and the tests can use it.

export type WebResult = { title: string; url: string; snippet: string }
export type WebResults = { query: string; results: WebResult[] }
// What the model is told about a search: what was found, or that none was done and why.
export type WebSearched = WebResults | { refused: string }

// What the server needs of a search service: a query in, a few results out. Throws if the service cannot be reached.
export type WebSearcher = (query: string) => Promise<WebResult[]>

const RESEARCH = /\b(research|researching|competitors?|competitive|competition|competing|market (?:research|analysis|size|landscape)|industry (?:analysis|trends?)|benchmark(?:ing)?|look (?:it |this |that )?up|look into|find out (?:about|what|who|how|if)|what(?:'s| is| are) (?:the )?(?:latest|current)|latest trends?|alternatives to|similar (?:businesses|companies|products)|who else (?:sells|does|offers)|going rates?)\b/i

// Whether the founder asked for research, in their own words.
export const wantsResearch = (text: string) => RESEARCH.test(text)

export const MAX_QUERY_CHARS = 200
const MAX_RESULTS = 5
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
export const groundingOfSearch = (found: WebResults): Grounding => ({ queries: [found.query], sources: found.results.map((result) => ({ title: result.title, url: result.url })), via: 'web' })
