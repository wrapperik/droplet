import { describe, expect, it } from 'vitest'
import { takeEvents } from '../src/lib/sse.ts'
import { eventStream, streamEvents, wantsStream } from './composeStream.ts'

const reply = { status: 200, body: { ok: true } }

describe('the composer\'s event stream', () => {
  it('writes a stage each time the work says so, then the result', async () => {
    let text = ''
    await streamEvents(async (tell) => {
      tell({ stage: 'reading' })
      tell({ stage: 'checking', searched: ['VAT'] })
      return reply
    }, (chunk) => (text += chunk))
    const { events } = takeEvents(text)
    expect(events.map((entry) => entry.event)).toEqual(['stage', 'stage', 'result'])
    expect(JSON.parse(events[1].data)).toEqual({ stage: 'checking', searched: ['VAT'] })
    expect(JSON.parse(events[2].data)).toEqual(reply)
  })

  it('carries a refusal in the result, with its status', async () => {
    let text = ''
    await streamEvents(async () => ({ status: 429, body: { error: 'advanced_limit' } }), (chunk) => (text += chunk))
    expect(JSON.parse(takeEvents(text).events[0].data)).toEqual({ status: 429, body: { error: 'advanced_limit' } })
  })

  it('turns an unexpected failure into a plain 500 that says nothing of what went wrong', async () => {
    let text = ''
    await streamEvents(async () => {
      throw new Error('secret detail: key AIza...')
    }, (chunk) => (text += chunk))
    expect(text).not.toMatch(/secret detail|AIza/)
    expect(JSON.parse(takeEvents(text).events[0].data)).toMatchObject({ status: 500, body: { error: 'unavailable' } })
  })

  it('finishes the work even when the reader has gone', async () => {
    let finished = false
    await streamEvents(async (tell) => {
      tell({ stage: 'reading' })
      finished = true
      return reply
    }, () => {
      throw new Error('closed')
    })
    expect(finished).toBe(true)
  })

  it('is also a web stream, for the Edge Function', async () => {
    const stream = eventStream(async (tell) => {
      tell({ stage: 'retrying' })
      return reply
    })
    const text = await new Response(stream).text()
    expect(takeEvents(text).events.map((entry) => entry.event)).toEqual(['stage', 'result'])
  })

  it('is asked for with Accept, and only then', () => {
    expect(wantsStream('text/event-stream, application/json')).toBe(true)
    expect(wantsStream('application/json')).toBe(false)
    expect(wantsStream(null)).toBe(false)
  })
})
