import { ComposeError, type ModelCaller } from './compose.ts'

// Two model providers in a row: the first answers, and if it fails in any way (no answer in time, a refused key, no balance, a server error, a refusal
// of the content, or something unexpected) the same request goes to the second, as Quick. The second's answer is checked by the same Zod schema and rules
// as any other. Only a failure to answer moves on: a reply that does not fit the schema is not a failure here, and is retried by the composition loop.
//
// If the second fails as well, the first's error is the one that stands, since that is the provider that was chosen. The server's own log says what
// happened, by provider and kind of error only, never with what the founder wrote.
export function withFallback(primary: { name: string; call: ModelCaller }, secondary: { name: string; call: ModelCaller }): ModelCaller {
  return async (request) => {
    try {
      return await primary.call(request)
    } catch (first) {
      const why = first instanceof ComposeError ? first.kind : 'unexpected'
      console.warn(`compose: ${primary.name} could not answer (${why}), so ${secondary.name} is answering instead`)
      try {
        return await secondary.call({ ...request, mode: 'base', search: false })
      } catch (second) {
        console.error(`compose: ${secondary.name} could not answer either (${second instanceof ComposeError ? second.kind : 'unexpected'})`)
        throw first
      }
    }
  }
}
