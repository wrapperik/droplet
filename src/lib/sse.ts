// Server-sent events, read from the text of a stream. The composer sends a stage as its work moves on and the reply at the end (see server/composeStream.ts).

export type SseEvent = { event: string; data: string }

// Takes the whole events off the front of the text so far and returns what is left (a half-received event waits for the rest). Comments (lines that begin
// with a colon) are skipped, a `data` of several lines is joined with newlines, and an event with no name is called "message", as the format says.
export function takeEvents(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = []
  let rest = buffer.replace(/\r\n?/g, '\n')
  for (;;) {
    const end = rest.indexOf('\n\n')
    if (end === -1) break
    const block = rest.slice(0, end)
    rest = rest.slice(end + 2)
    let event = 'message'
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (line === '' || line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon === -1 ? line : line.slice(0, colon)
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
      if (field === 'event') event = value
      else if (field === 'data') data.push(value)
    }
    if (data.length > 0) events.push({ event, data: data.join('\n') })
  }
  return { events, rest }
}
