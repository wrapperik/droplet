import type { ComposeStage } from '../src/compose/progress.ts'
import type { ServiceReply } from './composeService.ts'

// Server-sent events for the composer: the stage as it changes, then the reply. The dev server and the Edge Function both use it, so the browser reads one
// format from either. A stage carries nothing the founder wrote. The `result` event holds exactly what the plain JSON response would have: the status and
// the body, so a refusal or an error arrives the same way as an answer and the browser has one path for both.

export const EVENT_STREAM = 'text/event-stream'

// Whether a request asked for the stream (the browser says so with Accept). Anything else gets the plain JSON response, as before.
export function wantsStream(accept: string | null | undefined): boolean {
  return (accept ?? '').toLowerCase().includes(EVENT_STREAM)
}

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

// Runs the work and writes events as it goes: a stage each time the work says so, and the result at the end (a failure that was not expected is a
// plain 500, said in words and never with what went wrong inside). `write` may throw when the reader has gone; the work still finishes, so nothing it
// has already spent is left half done, and what it was meant to say is dropped.
export async function streamEvents(run: (tell: (stage: ComposeStage) => void) => Promise<ServiceReply>, write: (text: string) => void): Promise<void> {
  let open = true
  const send = (text: string) => {
    if (!open) return
    try {
      write(text)
    } catch {
      open = false
    }
  }
  // A comment first, so the connection is seen to be alive before the first stage.
  send(': ok\n\n')
  let reply: ServiceReply
  try {
    reply = await run((stage) => send(frame('stage', stage)))
  } catch (error) {
    console.error('compose: unexpected error:', error instanceof Error ? error.message : String(error))
    reply = { status: 500, body: { error: 'unavailable', message: 'Something went wrong while composing. Try again.' } }
  }
  send(frame('result', reply))
}

// The same as a web stream, for a runtime that answers with a Response (the Edge Function).
export function eventStream(run: (tell: (stage: ComposeStage) => void) => Promise<ServiceReply>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      await streamEvents(run, (text) => controller.enqueue(encoder.encode(text)))
      try {
        controller.close()
      } catch {
        // Already closed by the reader.
      }
    },
  })
}
