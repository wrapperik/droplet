import { chatTurn, openSnapshot, validOpenTurn } from '../compose/fixtures.ts'
import { requestComposition } from './composeClient.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const reply = (response: Response | Error) => (async () => {
  if (response instanceof Error) throw response
  return response
}) as unknown as typeof fetch

const request = { intent: 'a colour palette' }

describe('requestComposition', () => {
  it('sends the request to the app\'s own server', async () => {
    let seen: { url: string; init?: RequestInit } | null = null
    const impl = (async (url: string, init?: RequestInit) => {
      seen = { url, init }
      return json({ outcome: 'valid', turn: validOpenTurn })
    }) as unknown as typeof fetch
    await requestComposition(request, { fetchImpl: impl })
    expect(seen!.url).toBe('/api/compose')
    expect(seen!.init?.method).toBe('POST')
    expect(JSON.parse(String(seen!.init?.body))).toEqual(request)
  })

  it('returns a valid answer with how it went', async () => {
    const result = await requestComposition(request, { fetchImpl: reply(json({ outcome: 'retried', turn: validOpenTurn })) })
    expect(result).toMatchObject({ ok: true, outcome: 'retried', turn: { task: 'brand' } })
  })

  it('returns an ordinary answer with no actions', async () => {
    const result = await requestComposition({ intent: 'how do I price?' }, { fetchImpl: reply(json({ outcome: 'valid', turn: chatTurn })) })
    expect(result).toMatchObject({ ok: true, turn: { task: 'chat', actions: [] } })
  })

  it('passes on the note when a simpler view was used', async () => {
    const result = await requestComposition(request, { fetchImpl: reply(json({ outcome: 'fallback', turn: validOpenTurn, note: 'A simpler view was used.' })) })
    expect(result).toMatchObject({ ok: true, outcome: 'fallback', note: 'A simpler view was used.' })
  })

  it('re-checks the turn and refuses one that does not match the schema', async () => {
    const result = await requestComposition(request, { fetchImpl: reply(json({ outcome: 'valid', turn: { ...validOpenTurn, task: 'weather' } })) })
    expect(result).toMatchObject({ ok: false, kind: 'bad_response' })
  })

  it('re-checks the actions against the workspace the request was about, so a wrong server cannot slip a bad turn through', async () => {
    const impossible = { ...chatTurn, task: 'brand', actions: [{ type: 'set_colour', index: 7, hex: '#123456' }] }
    const result = await requestComposition({ ...request, workspace: openSnapshot() }, { fetchImpl: reply(json({ outcome: 'valid', turn: impossible })) })
    expect(result).toMatchObject({ ok: false, kind: 'bad_response' })
  })

  it('passes on the server\'s plain message and kind when it refuses', async () => {
    const result = await requestComposition(request, {
      fetchImpl: reply(json({ error: 'no_key', message: 'No Gemini API key is set.' }, 503)),
    })
    expect(result).toEqual({ ok: false, kind: 'no_key', message: 'No Gemini API key is set.' })
  })

  it('treats an unknown error as the composer being unavailable', async () => {
    const result = await requestComposition(request, { fetchImpl: reply(json({ error: 'surprise' }, 500)) })
    expect(result).toMatchObject({ ok: false, kind: 'unavailable' })
    const empty = await requestComposition(request, { fetchImpl: reply(new Response('oops', { status: 502 })) })
    expect(empty).toMatchObject({ ok: false, kind: 'unavailable' })
  })

  it('says when the server cannot be reached, and when it takes too long', async () => {
    expect(await requestComposition(request, { fetchImpl: reply(new TypeError('failed')) })).toMatchObject({ ok: false, kind: 'network' })
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    expect(await requestComposition(request, { fetchImpl: reply(abort) })).toMatchObject({ ok: false, kind: 'timeout' })
  })
})
