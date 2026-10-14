import { chatTurn, openSnapshot, validOpenTurn } from '../compose/fixtures.ts'
import { fetchAllowance, requestComposition } from './composeClient.ts'

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
      return json({ outcome: 'valid', answeredBy: 'base', turn: validOpenTurn })
    }) as unknown as typeof fetch
    await requestComposition(request, { fetchImpl: impl })
    expect(seen!.url).toBe('/api/compose')
    expect(seen!.init?.method).toBe('POST')
    expect(JSON.parse(String(seen!.init?.body))).toEqual(request)
  })

  it('returns a valid answer with how it went', async () => {
    const result = await requestComposition(request, { fetchImpl: reply(json({ outcome: 'retried', answeredBy: 'base', turn: validOpenTurn })) })
    expect(result).toMatchObject({ ok: true, outcome: 'retried', answeredBy: 'base', turn: { task: 'brand' } })
  })

  it('returns an ordinary answer with no actions', async () => {
    const result = await requestComposition({ intent: 'how do I price?' }, { fetchImpl: reply(json({ outcome: 'valid', answeredBy: 'base', turn: chatTurn })) })
    expect(result).toMatchObject({ ok: true, turn: { task: 'chat', actions: [] } })
  })

  it('passes on the note when a simpler view was used', async () => {
    const result = await requestComposition(request, { fetchImpl: reply(json({ outcome: 'fallback', answeredBy: 'base', turn: validOpenTurn, note: 'A simpler view was used.' })) })
    expect(result).toMatchObject({ ok: true, outcome: 'fallback', answeredBy: 'base', note: 'A simpler view was used.' })
  })

  it('re-checks the turn and refuses one that does not match the schema', async () => {
    const result = await requestComposition(request, { fetchImpl: reply(json({ outcome: 'valid', answeredBy: 'base', turn: { ...validOpenTurn, task: 'weather' } })) })
    expect(result).toMatchObject({ ok: false, kind: 'bad_response' })
  })

  it('re-checks the actions against the workspace the request was about, so a wrong server cannot slip a bad turn through', async () => {
    const impossible = { ...chatTurn, task: 'brand', actions: [{ type: 'set_colour', index: 7, hex: '#123456' }] }
    const result = await requestComposition({ ...request, workspace: openSnapshot() }, { fetchImpl: reply(json({ outcome: 'valid', answeredBy: 'base', turn: impossible })) })
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

describe('requestComposition against the deployed function', () => {
  const target = { url: 'https://abc.supabase.co/functions/v1/compose', authenticated: true }
  const headers = async () => ({ authorization: 'Bearer the-users-token', apikey: 'publishable' })

  it('sends the request to the function with the founder\'s token', async () => {
    let seen: { url: string; init?: RequestInit } | null = null
    const impl = (async (url: string, init?: RequestInit) => {
      seen = { url, init }
      return json({ outcome: 'valid', answeredBy: 'base', turn: validOpenTurn })
    }) as unknown as typeof fetch
    const result = await requestComposition(request, { fetchImpl: impl, target, headers })
    expect(result.ok).toBe(true)
    expect(seen!.url).toBe('https://abc.supabase.co/functions/v1/compose')
    expect(seen!.init?.headers).toMatchObject({ 'content-type': 'application/json', authorization: 'Bearer the-users-token', apikey: 'publishable' })
  })

  it('asks for headers for the target it is sending to', async () => {
    let asked: unknown = null
    await requestComposition(request, {
      fetchImpl: reply(json({ outcome: 'valid', answeredBy: 'base', turn: validOpenTurn })),
      target,
      headers: async (given) => {
        asked = given
        return {}
      },
    })
    expect(asked).toBe(target)
  })

  it('tells the founder to sign in again when the function says the session is not good', async () => {
    const result = await requestComposition(request, { fetchImpl: reply(json({ error: 'unauthorised', message: 'Sign in to use Droplet.' }, 401)), target, headers })
    expect(result).toEqual({ ok: false, kind: 'unauthorised', message: 'Sign in to use Droplet.' })
  })

  it('does not tell a founder of the deployed app to check a dev server', async () => {
    const result = await requestComposition(request, { fetchImpl: reply(new Error('offline')), target, headers })
    expect(result).toMatchObject({ ok: false, kind: 'network', message: expect.stringMatching(/Check your connection/) })
    const dev = await requestComposition(request, { fetchImpl: reply(new Error('offline')) })
    expect(dev).toMatchObject({ ok: false, kind: 'network', message: expect.stringMatching(/dev server/) })
  })
})

describe('Quick and Advanced, from the browser', () => {
  const allowance = { advancedLeft: 7, advancedLimit: 10, resetsAt: '2026-10-07T08:00:00.000Z' }

  it('sends the mode with the request, and sends none for Quick', async () => {
    const bodies: unknown[] = []
    const impl = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      return json({ outcome: 'valid', answeredBy: 'advanced', turn: chatTurn })
    }) as unknown as typeof fetch
    await requestComposition({ intent: 'What does CIPC charge?', mode: 'advanced' }, { fetchImpl: impl })
    await requestComposition({ intent: 'hi' }, { fetchImpl: impl })
    expect(bodies).toEqual([{ intent: 'What does CIPC charge?', mode: 'advanced' }, { intent: 'hi' }])
  })

  it('returns which mode answered and where the allowance stands', async () => {
    const result = await requestComposition({ intent: 'x', mode: 'advanced' }, { fetchImpl: reply(json({ outcome: 'valid', answeredBy: 'base', allowance, note: 'Advanced is busy today, so I answered with Quick.', turn: chatTurn })) })
    expect(result).toMatchObject({ ok: true, answeredBy: 'base', allowance, note: 'Advanced is busy today, so I answered with Quick.' })
  })

  it('refuses a reply that does not say which mode answered, or an allowance that is not a count', async () => {
    expect(await requestComposition(request, { fetchImpl: reply(json({ outcome: 'valid', turn: chatTurn })) })).toMatchObject({ ok: false, kind: 'bad_response' })
    expect(await requestComposition(request, { fetchImpl: reply(json({ outcome: 'valid', answeredBy: 'base', allowance: { advancedLeft: -1, advancedLimit: 10, resetsAt: null }, turn: chatTurn })) })).toMatchObject({ ok: false, kind: 'bad_response' })
    expect(await requestComposition(request, { fetchImpl: reply(json({ outcome: 'valid', answeredBy: 'turbo', turn: chatTurn })) })).toMatchObject({ ok: false, kind: 'bad_response' })
  })

  it('passes on the refusal for having no Advanced answers left, with the allowance that says so', async () => {
    const none = { advancedLeft: 0, advancedLimit: 10, resetsAt: '2026-10-07T08:00:00.000Z' }
    const result = await requestComposition({ intent: 'x', mode: 'advanced' }, { fetchImpl: reply(json({ error: 'advanced_limit', message: 'You have used your 10 Advanced answers for today.', allowance: none }, 429)) })
    expect(result).toEqual({ ok: false, kind: 'advanced_limit', message: 'You have used your 10 Advanced answers for today.', allowance: none })
  })

  it('ignores an allowance in a failure that is not one', async () => {
    const result = await requestComposition(request, { fetchImpl: reply(json({ error: 'timeout', message: 'Slow.', allowance: { advancedLeft: 'lots' } }, 504)) })
    expect(result).toEqual({ ok: false, kind: 'timeout', message: 'Slow.' })
  })
})

describe('fetchAllowance', () => {
  const allowance = { advancedLeft: 7, advancedLimit: 10, resetsAt: null }

  it('asks the server with a GET, with the founder\'s token for the deployed function, and returns the count', async () => {
    let seen: { url: string; init?: RequestInit } | null = null
    const impl = (async (url: string, init?: RequestInit) => {
      seen = { url, init }
      return json({ allowance })
    }) as unknown as typeof fetch
    const target = { url: 'https://abc.supabase.co/functions/v1/compose', authenticated: true }
    const found = await fetchAllowance({ fetchImpl: impl, target, headers: async () => ({ authorization: 'Bearer token', apikey: 'publishable' }) })
    expect(found).toEqual(allowance)
    expect(seen!.url).toBe(target.url)
    expect(seen!.init?.method).toBe('GET')
    expect(seen!.init?.headers).toMatchObject({ authorization: 'Bearer token' })
    expect(seen!.init?.body).toBeUndefined()
  })

  it('says nothing when it cannot find out: a refusal, a bad answer or no connection', async () => {
    expect(await fetchAllowance({ fetchImpl: reply(json({ error: 'unavailable' }, 500)) })).toBeNull()
    expect(await fetchAllowance({ fetchImpl: reply(json({ allowance: { advancedLeft: 'many' } })) })).toBeNull()
    expect(await fetchAllowance({ fetchImpl: reply(json({})) })).toBeNull()
    expect(await fetchAllowance({ fetchImpl: reply(new TypeError('offline')) })).toBeNull()
  })
})

describe('requestSummary', () => {
  const messages = [
    { role: 'founder' as const, text: 'I will call it Kindred Gifting' },
    { role: 'droplet' as const, text: 'Lovely.' },
  ]
  const good = { task: 'ideation', subject: 'Naming the business', decided: ['settled on the name Kindred Gifting'], open: [] }
  const answer = (summary: unknown) => json({ kind: 'summarise_chat', answeredBy: 'base', summary })

  it('sends the chat as a request of its own kind, and returns the memory', async () => {
    let body: unknown
    const impl = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return answer(good)
    }) as unknown as typeof fetch
    const { requestSummary } = await import('./composeClient.ts')
    expect(await requestSummary(messages, { fetchImpl: impl })).toEqual({ ok: true, summary: good })
    expect(body).toEqual({ kind: 'summarise_chat', messages })
  })

  it('checks the memory again against the chat, and keeps nothing that has a name that is not in it', async () => {
    const { requestSummary } = await import('./composeClient.ts')
    expect(await requestSummary(messages, { fetchImpl: reply(answer({ ...good, decided: ['settled on the name DuckStack'] })) })).toEqual({ ok: true, summary: null })
  })

  it('keeps nothing when the server found none it could trust', async () => {
    const { requestSummary } = await import('./composeClient.ts')
    expect(await requestSummary(messages, { fetchImpl: reply(answer(null)) })).toEqual({ ok: true, summary: null })
  })

  it('reports a failure as one, and an answer that is not one', async () => {
    const { requestSummary } = await import('./composeClient.ts')
    expect(await requestSummary(messages, { fetchImpl: reply(json({ error: 'rate_limited', message: 'Slow down.' }, 429)) })).toMatchObject({ ok: false, kind: 'rate_limited' })
    expect(await requestSummary(messages, { fetchImpl: reply(new TypeError('offline')) })).toMatchObject({ ok: false, kind: 'network' })
    expect(await requestSummary(messages, { fetchImpl: reply(json({ kind: 'summarise_chat', answeredBy: 'advanced', summary: good })) })).toMatchObject({ ok: false, kind: 'bad_response' })
  })

  it('uses the same address and headers as a message', async () => {
    let seen: { url: string; init?: RequestInit } | null = null
    const impl = (async (url: string, init?: RequestInit) => {
      seen = { url, init }
      return answer(null)
    }) as unknown as typeof fetch
    const { requestSummary } = await import('./composeClient.ts')
    await requestSummary(messages, { fetchImpl: impl, target: { url: 'https://abc.supabase.co/functions/v1/compose', authenticated: true }, headers: async () => ({ authorization: 'Bearer t' }) })
    expect(seen!.url).toBe('https://abc.supabase.co/functions/v1/compose')
    expect(seen!.init?.headers).toMatchObject({ authorization: 'Bearer t' })
  })
})

describe('requestDigest', () => {
  const request = {
    kind: 'digest_workspace' as const,
    workspace: 'board' as const,
    projectName: 'Paws',
    items: [
      { ref: 'r1', text: 'Care plan for older dogs', starred: true },
      { ref: 'r2', text: 'Pet Pals' },
    ],
  }
  const digest = { about: 'Ideas for a pet care business', decided: [], open: ['what to charge'], standouts: [{ ref: 'r1', reason: 'starred' }] }
  const answer = (value: unknown) => json({ kind: 'digest_workspace', answeredBy: 'base', digest: value })

  it('sends the items as a request of its own kind, and returns the digest', async () => {
    let body: unknown
    const impl = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return answer(digest)
    }) as unknown as typeof fetch
    const { requestDigest } = await import('./composeClient.ts')
    expect(await requestDigest(request, { fetchImpl: impl })).toEqual({ ok: true, digest })
    expect(body).toEqual(request)
  })

  it('checks the digest again against the items, and keeps nothing with a name that is not in them', async () => {
    const { requestDigest } = await import('./composeClient.ts')
    expect(await requestDigest(request, { fetchImpl: reply(answer({ ...digest, about: 'Ideas for Rover' })) })).toEqual({ ok: true, digest: null })
    expect(await requestDigest(request, { fetchImpl: reply(answer(null)) })).toEqual({ ok: true, digest: null })
  })

  it('reports a failure, and an answer that is the wrong kind', async () => {
    const { requestDigest } = await import('./composeClient.ts')
    expect(await requestDigest(request, { fetchImpl: reply(json({ error: 'rate_limited', message: 'Slow.' }, 429)) })).toMatchObject({ ok: false, kind: 'rate_limited' })
    expect(await requestDigest(request, { fetchImpl: reply(json({ kind: 'summarise_chat', answeredBy: 'base', summary: null })) })).toMatchObject({ ok: false, kind: 'bad_response' })
  })
})

// ---- Progress, and stopping ----

const encoder = new TextEncoder()
// A response that arrives in the pieces given, as a stream would.
const streamed = (pieces: string[], status = 200) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of pieces) controller.enqueue(encoder.encode(piece))
        controller.close()
      },
    }),
    { status, headers: { 'content-type': 'text/event-stream' } },
  )
const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`
const answer = { outcome: 'valid', answeredBy: 'base', turn: chatTurn }

describe('requestComposition with progress', () => {
  it('asks for the stream, and still takes plain JSON', async () => {
    let accept = ''
    const impl = (async (_url: string, init?: RequestInit) => {
      accept = String(((init?.headers ?? {}) as Record<string, string>).accept)
      return json(answer)
    }) as unknown as typeof fetch
    const result = await requestComposition({ intent: 'hi' }, { fetchImpl: impl })
    expect(accept).toContain('text/event-stream')
    expect(result).toMatchObject({ ok: true, turn: { task: 'chat' } })
  })

  it('tells the caller each stage as it arrives, then returns the reply', async () => {
    const stages: unknown[] = []
    const fetchImpl = reply(streamed([': ok\n\n', event('stage', { stage: 'reading', search: true }), event('stage', { stage: 'checking', searched: ['VAT registration'] }), event('result', { status: 200, body: answer })]))
    const result = await requestComposition({ intent: 'hi' }, { fetchImpl, onStage: (stage) => stages.push(stage) })
    expect(stages).toEqual([{ stage: 'reading', search: true }, { stage: 'checking', searched: ['VAT registration'] }])
    expect(result).toMatchObject({ ok: true, outcome: 'valid', turn: { task: 'chat' } })
  })

  it('reads events split across pieces', async () => {
    const whole = event('stage', { stage: 'reading' }) + event('result', { status: 200, body: answer })
    const cut = Math.floor(whole.length / 2)
    const stages: unknown[] = []
    const result = await requestComposition({ intent: 'hi' }, { fetchImpl: reply(streamed([whole.slice(0, cut), whole.slice(cut)])), onStage: (stage) => stages.push(stage) })
    expect(stages).toEqual([{ stage: 'reading' }])
    expect(result.ok).toBe(true)
  })

  it('ignores a stage it does not know', async () => {
    const stages: unknown[] = []
    await requestComposition({ intent: 'hi' }, { fetchImpl: reply(streamed([event('stage', { stage: 'daydreaming' }), event('result', { status: 200, body: answer })])), onStage: (stage) => stages.push(stage) })
    expect(stages).toEqual([])
  })

  it('reads a refusal in the result event the way it reads one in a plain response', async () => {
    const body = { error: 'advanced_limit', message: 'You have used your 10 Advanced answers for today.' }
    const result = await requestComposition({ intent: 'hi' }, { fetchImpl: reply(streamed([event('result', { status: 429, body })])) })
    expect(result).toMatchObject({ ok: false, kind: 'advanced_limit', message: body.message })
  })

  it('says the connection dropped when the stream ends without a reply', async () => {
    const result = await requestComposition({ intent: 'hi' }, { fetchImpl: reply(streamed([event('stage', { stage: 'reading' })])) })
    expect(result).toMatchObject({ ok: false, kind: 'network' })
    expect(!result.ok && result.message).toMatch(/lost the connection/)
  })

  it('still checks a streamed reply against the rules, so an unusable one never gets through', async () => {
    const result = await requestComposition({ intent: 'hi' }, { fetchImpl: reply(streamed([event('result', { status: 200, body: { outcome: 'valid', answeredBy: 'base', turn: { task: 'nonsense' } } })])) })
    expect(result).toMatchObject({ ok: false, kind: 'bad_response' })
  })
})

describe('stopping a request', () => {
  it('gives up at once and applies nothing, when stopped before it starts', async () => {
    const controller = new AbortController()
    controller.abort()
    let called = false
    const impl = (async () => {
      called = true
      return json(answer)
    }) as unknown as typeof fetch
    const result = await requestComposition({ intent: 'hi' }, { fetchImpl: impl, signal: controller.signal })
    expect(called).toBe(false)
    expect(result).toMatchObject({ ok: false, kind: 'aborted', message: 'Stopped. Nothing was changed.' })
  })

  it('gives up while waiting for the reply, and says it was stopped, not that it timed out', async () => {
    const controller = new AbortController()
    const impl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        // As the real fetch does: a signal that is already aborted gives up at once.
        if (init?.signal?.aborted) abort()
        else init?.signal?.addEventListener('abort', abort)
      })) as unknown as typeof fetch
    const pending = requestComposition({ intent: 'hi' }, { fetchImpl: impl, signal: controller.signal })
    controller.abort()
    expect(await pending).toMatchObject({ ok: false, kind: 'aborted' })
  })
})

describe('a stream that stalls', () => {
  it('times out, and says so, rather than waiting for ever', async () => {
    const impl = (async () => new Response(new ReadableStream<Uint8Array>({ start() {} }), { status: 200, headers: { 'content-type': 'text/event-stream' } })) as unknown as typeof fetch
    const result = await requestComposition({ intent: 'hi' }, { fetchImpl: impl, timeoutMs: 30 })
    expect(result).toMatchObject({ ok: false, kind: 'timeout' })
  })

  it('is stopped, not timed out, when the founder stops it', async () => {
    const controller = new AbortController()
    const impl = (async () => new Response(new ReadableStream<Uint8Array>({ start() {} }), { status: 200, headers: { 'content-type': 'text/event-stream' } })) as unknown as typeof fetch
    const pending = requestComposition({ intent: 'hi' }, { fetchImpl: impl, signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 20))
    controller.abort()
    expect(await pending).toMatchObject({ ok: false, kind: 'aborted' })
  })
})
