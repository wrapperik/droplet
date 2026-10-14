import { describe, expect, it } from 'vitest'
import { takeEvents } from './sse.ts'

describe('reading server-sent events', () => {
  it('takes whole events and leaves a half-received one for later', () => {
    const first = takeEvents('event: stage\ndata: {"stage":"reading"}\n\nevent: result\ndata: {"sta')
    expect(first.events).toEqual([{ event: 'stage', data: '{"stage":"reading"}' }])
    const second = takeEvents(first.rest + 'tus":200}\n\n')
    expect(second.events).toEqual([{ event: 'result', data: '{"status":200}' }])
    expect(second.rest).toBe('')
  })

  it('skips comments, joins data lines and calls an unnamed event a message', () => {
    expect(takeEvents(': ok\n\ndata: one\ndata: two\n\n').events).toEqual([{ event: 'message', data: 'one\ntwo' }])
  })

  it('reads CRLF line endings', () => {
    expect(takeEvents('event: stage\r\ndata: {}\r\n\r\n').events).toEqual([{ event: 'stage', data: '{}' }])
  })

  it('has nothing to give until an event is finished', () => {
    expect(takeEvents('event: stage\ndata: {}\n')).toEqual({ events: [], rest: 'event: stage\ndata: {}\n' })
  })
})
