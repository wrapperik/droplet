import { z } from 'zod'

// What a reply that used Google Search carries besides its words: what was searched for, the pages it drew on, and Google's search
// suggestions. All of it comes from the API's grounding metadata, never from the model's own words, so a source cannot be made up.
//
// Google's terms for Grounding with Google Search require the search suggestions to be shown, exactly as given and as wide as the answer,
// whenever a grounded answer is shown, and nothing else to be mixed into the grounded answer. The interface draws them in a sandboxed frame
// with no scripts (WebSources.tsx), and keeps the app's own notes out of a grounded message.

export const MAX_SOURCES = 8
export const MAX_QUERIES = 6
// Google's suggestions are a small block of HTML and CSS. Anything far larger is not what was expected and is left out.
export const MAX_SUGGESTIONS_LENGTH = 40_000

const httpsUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:'
    } catch {
      return false
    }
  }, 'must be an https address')

export const groundingSchema = z.object({
  // What the model searched for, in its own words. Never the founder's private details: the prompt says so, and nothing private is sent to it.
  queries: z.array(z.string().max(200)).max(MAX_QUERIES),
  sources: z.array(z.object({ title: z.string().max(200), url: httpsUrl })).max(MAX_SOURCES),
  // Google's search suggestions (searchEntryPoint.renderedContent), shown as given.
  suggestions: z.string().max(MAX_SUGGESTIONS_LENGTH).optional(),
})

export type Grounding = z.infer<typeof groundingSchema>

type RawGrounding = {
  webSearchQueries?: unknown
  groundingChunks?: { web?: { uri?: unknown; title?: unknown } }[]
  searchEntryPoint?: { renderedContent?: unknown }
}

// The grounding metadata of a Gemini candidate, read defensively: anything missing or malformed is left out. Undefined when nothing was searched.
export function groundingFromMetadata(metadata: unknown): Grounding | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined
  const raw = metadata as RawGrounding
  const queries = (Array.isArray(raw.webSearchQueries) ? raw.webSearchQueries : [])
    .filter((query): query is string => typeof query === 'string' && query.trim() !== '')
    .map((query) => query.trim().slice(0, 200))
    .slice(0, MAX_QUERIES)
  const seen = new Set<string>()
  const sources = (Array.isArray(raw.groundingChunks) ? raw.groundingChunks : [])
    .flatMap((chunk) => {
      const url = chunk?.web?.uri
      if (typeof url !== 'string' || seen.has(url) || !httpsUrl.safeParse(url).success) return []
      seen.add(url)
      const title = typeof chunk.web?.title === 'string' && chunk.web.title.trim() !== '' ? chunk.web.title.trim().slice(0, 200) : new URL(url).hostname
      return [{ title, url }]
    })
    .slice(0, MAX_SOURCES)
  const rendered = raw.searchEntryPoint?.renderedContent
  const suggestions = typeof rendered === 'string' && rendered.trim() !== '' && rendered.length <= MAX_SUGGESTIONS_LENGTH ? rendered : undefined
  if (queries.length === 0 && sources.length === 0 && !suggestions) return undefined
  return { queries, sources, ...(suggestions ? { suggestions } : {}) }
}
