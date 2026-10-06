import { ComposeError, type ModelCaller } from './compose.ts'
import { createGeminiCaller, DEFAULT_ADVANCED_MODEL, DEFAULT_BASE_MODEL } from './gemini.ts'

const request = { system: 'You are the composer.', user: '<request>\nhi\n</request>', schema: { type: 'object' } }
const advancedRequest = { ...request, mode: 'advanced' as const }
// The words of a reply, whether the caller gave them bare or with what it knows about how it answered.
const said = async (answer: ReturnType<ModelCaller>) => {
  const reply = await answer
  return typeof reply === 'string' ? reply : reply.text
}
const reply = (text: string, extra: object = {}) => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], ...extra })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

type Call = { url: string; init: RequestInit }
const fakeFetch = (responses: (Response | Error)[]) => {
  const calls: Call[] = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = responses[calls.length - 1]
    if (next instanceof Error) throw next
    return next
  }) as typeof fetch
  return { impl, calls }
}

describe('createGeminiCaller', () => {
  it('sends the key in a header only, with the instructions, the request and the schema', async () => {
    const { impl, calls } = fakeFetch([json(reply('{"ok":true}'))])
    const text = await said(createGeminiCaller({ apiKey: 'SECRET-KEY', fetchImpl: impl })(request))
    expect(text).toBe('{"ok":true}')

    const { url, init } = calls[0]
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_BASE_MODEL}:generateContent`)
    expect(url).not.toContain('SECRET-KEY')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('SECRET-KEY')
    expect(String(init.body)).not.toContain('SECRET-KEY')

    const body = JSON.parse(String(init.body))
    expect(body.systemInstruction.parts[0].text).toBe(request.system)
    expect(body.contents[0].parts[0].text).toBe(request.user)
    expect(body.generationConfig).toEqual({ responseMimeType: 'application/json', responseJsonSchema: request.schema, thinkingConfig: { thinkingLevel: 'low' } })
  })

  it('thinks briefly in Quick unless told otherwise, and in Advanced only when told to', async () => {
    const quick = fakeFetch([json(reply('{}'))])
    await createGeminiCaller({ apiKey: 'k', fetchImpl: quick.impl })(request)
    expect(JSON.parse(String(quick.calls[0].init.body)).generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' })
    const quickHigher = fakeFetch([json(reply('{}'))])
    await createGeminiCaller({ apiKey: 'k', baseThinking: 'medium', fetchImpl: quickHigher.impl })(request)
    expect(JSON.parse(String(quickHigher.calls[0].init.body)).generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'medium' })
    const advanced = fakeFetch([json(reply('{}'))])
    await createGeminiCaller({ apiKey: 'k', fetchImpl: advanced.impl })(advancedRequest)
    expect(JSON.parse(String(advanced.calls[0].init.body)).generationConfig.thinkingConfig).toBeUndefined()
    const advancedSet = fakeFetch([json(reply('{}'))])
    await createGeminiCaller({ apiKey: 'k', advancedThinking: 'high', fetchImpl: advancedSet.impl })(advancedRequest)
    expect(JSON.parse(String(advancedSet.calls[0].init.body)).generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'high' })
  })

  it('asks the Quick model for a message that names no mode, and the Advanced model for an Advanced one, as the models it was given', async () => {
    const { impl, calls } = fakeFetch([json(reply('{}')), json(reply('{}')), json(reply('{}'))])
    const caller = createGeminiCaller({ apiKey: 'k', baseModel: 'quick-model', advancedModel: 'advanced-model', fetchImpl: impl })
    await caller(request)
    await caller({ ...request, mode: 'base' })
    await caller(advancedRequest)
    expect(calls.map((call) => /models\/([^:]+):/.exec(call.url)![1])).toEqual(['quick-model', 'quick-model', 'advanced-model'])
  })

  it('uses the Gemini 3.5 Flash Lite and 3.8 Flash models unless told otherwise', () => {
    expect(DEFAULT_BASE_MODEL).toBe('gemini-3.5-flash-lite')
    expect(DEFAULT_ADVANCED_MODEL).toBe('gemini-3.8-flash')
  })

  it('says which mode and model answered, and how many tokens it used', async () => {
    const usage = { usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 80, thoughtsTokenCount: 30, totalTokenCount: 1310 } }
    const { impl } = fakeFetch([json(reply('{}', usage)), json(reply('{}'))])
    const caller = createGeminiCaller({ apiKey: 'k', fetchImpl: impl })
    const answered = (await caller(request)) as { meta: unknown }
    expect(answered.meta).toEqual({ model: DEFAULT_BASE_MODEL, answeredBy: 'base', usage: { prompt: 1200, answer: 80, thinking: 30 } })
    // no usage metadata, no usage
    const bare = (await caller(advancedRequest)) as { meta: Record<string, unknown> }
    expect(bare.meta).toEqual({ model: DEFAULT_ADVANCED_MODEL, answeredBy: 'advanced' })
  })

  it('joins the answer parts and ignores reasoning parts', async () => {
    const body = { candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }, { text: '{"a":' }, { text: '1}' }] }, finishReason: 'STOP' }] }
    const { impl } = fakeFetch([json(body)])
    expect(await said(createGeminiCaller({ apiKey: 'k', fetchImpl: impl })(request))).toBe('{"a":1}')
  })

  it('returns an empty answer as empty text, for the loop to treat as invalid', async () => {
    const { impl } = fakeFetch([json({ candidates: [{ finishReason: 'MAX_TOKENS' }] })])
    expect(await said(createGeminiCaller({ apiKey: 'k', fetchImpl: impl })(request))).toBe('')
  })

  it.each([
    [401, 'bad_key'],
    [403, 'bad_key'],
    [404, 'bad_model'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [400, 'bad_request'],
  ])('turns a %i answer into a "%s" error', async (status, kind) => {
    // two answers, because a 400 or a 503 is tried a second time
    const { impl } = fakeFetch([json({ error: { message: 'something' } }, status), json({ error: { message: 'something' } }, status)])
    await expect(createGeminiCaller({ apiKey: 'k', overloadRetryMs: 1, fetchImpl: impl })(request)).rejects.toMatchObject({ kind })
  })

  it('reports a request the model declined', async () => {
    const { impl } = fakeFetch([json({ promptFeedback: { blockReason: 'SAFETY' } })])
    await expect(createGeminiCaller({ apiKey: 'k', fetchImpl: impl })(request)).rejects.toMatchObject({ kind: 'blocked' })
    const { impl: second } = fakeFetch([json({ candidates: [{ finishReason: 'SAFETY' }] })])
    await expect(createGeminiCaller({ apiKey: 'k', fetchImpl: second })(request)).rejects.toMatchObject({ kind: 'blocked' })
  })

  it('reports a timeout and an unreachable network differently', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    await expect(createGeminiCaller({ apiKey: 'k', fetchImpl: fakeFetch([abort]).impl })(request)).rejects.toMatchObject({ kind: 'timeout' })
    await expect(createGeminiCaller({ apiKey: 'k', fetchImpl: fakeFetch([new TypeError('fetch failed')]).impl })(request)).rejects.toMatchObject({
      kind: 'unavailable',
    })
  })

  it('aborts a request that takes longer than the time allowed', async () => {
    const hang = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })) as unknown as typeof fetch
    await expect(createGeminiCaller({ apiKey: 'k', timeoutMs: 20, fetchImpl: hang })(request)).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('never puts the key in an error message', async () => {
    const { impl } = fakeFetch([json({ error: { message: 'bad request' } }, 400), json({ error: { message: 'bad request' } }, 400)])
    const error = await createGeminiCaller({ apiKey: 'SECRET-KEY', fetchImpl: impl })(request).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ComposeError)
    expect((error as Error).message).not.toContain('SECRET-KEY')
  })

  it('carries on without the schema field if the API refuses it, and remembers once that works', async () => {
    const refusal = json({ error: { message: 'Request contains an invalid argument.' } }, 400)
    const { impl, calls } = fakeFetch([refusal, json(reply('{"ok":1}')), json(reply('{"ok":2}'))])
    const caller = createGeminiCaller({ apiKey: 'k', fetchImpl: impl })

    expect(await said(caller(request))).toBe('{"ok":1}')
    const second = JSON.parse(String(calls[1].init.body))
    expect(second.generationConfig).toEqual({ responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } })
    expect(second.systemInstruction.parts[0].text).toContain('"type":"object"')

    await caller(request)
    expect(calls).toHaveLength(3)
    expect(JSON.parse(String(calls[2].init.body)).generationConfig.responseJsonSchema).toBeUndefined()
  })

  it('tries once more when the model is briefly overloaded, and gives up if it still is', async () => {
    const busy = () => json({ error: { message: 'high demand' } }, 503)
    const recovers = fakeFetch([busy(), json(reply('{"ok":1}'))])
    expect(await said(createGeminiCaller({ apiKey: 'k', overloadRetryMs: 1, fetchImpl: recovers.impl })(request))).toBe('{"ok":1}')
    expect(recovers.calls).toHaveLength(2)
    const stays = fakeFetch([busy(), busy()])
    await expect(createGeminiCaller({ apiKey: 'k', overloadRetryMs: 1, fetchImpl: stays.impl })(request)).rejects.toMatchObject({ kind: 'unavailable' })
    expect(stays.calls).toHaveLength(2)
  })

  it('keeps sending the schema if the retry without it fails too, because then the schema was not the problem', async () => {
    const refusal = () => json({ error: { message: 'Request contains an invalid argument.' } }, 400)
    const { impl, calls } = fakeFetch([refusal(), refusal(), json(reply('{"ok":1}'))])
    const caller = createGeminiCaller({ apiKey: 'k', fetchImpl: impl })
    await expect(caller(request)).rejects.toMatchObject({ kind: 'bad_request' })
    await caller(request)
    expect(JSON.parse(String(calls[2].init.body)).generationConfig.responseJsonSchema).toEqual(request.schema)
  })
})

const dailyQuota = () =>
  json(
    {
      error: {
        message: 'You exceeded your current quota',
        details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }], retryDelay: '18494s' }],
      },
    },
    429,
  )
const minuteQuota = () =>
  json({ error: { message: 'Resource exhausted', details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }], retryDelay: '30s' }] } }, 429)

describe('quota', () => {
  const both = { baseModel: 'quick-model', advancedModel: 'main-model' }

  it('tells a used-up daily quota from a busy minute, and says how long it will be', async () => {
    const daily = await createGeminiCaller({ apiKey: 'k', fetchImpl: fakeFetch([dailyQuota()]).impl })(request).catch((e: unknown) => e)
    expect(daily).toMatchObject({ kind: 'quota', retryAfterSeconds: 18494 })
    expect((daily as Error).message).toMatch(/free daily limit for gemini-3\.5-flash-lite.*in about 5 hours/)
    const minute = await createGeminiCaller({ apiKey: 'k', fetchImpl: fakeFetch([minuteQuota()]).impl })(request).catch((e: unknown) => e)
    expect(minute).toMatchObject({ kind: 'rate_limited', retryAfterSeconds: 30 })
  })

  it('answers an Advanced request with Quick when Advanced\'s daily quota is used up, and says Quick answered, because Google\'s model could not', async () => {
    const { impl, calls } = fakeFetch([dailyQuota(), json(reply('{"from":"quick"}'))])
    const caller = createGeminiCaller({ apiKey: 'k', ...both, fetchImpl: impl })
    const answered = (await caller(advancedRequest)) as { text: string; meta: Record<string, unknown> }
    expect(answered.text).toBe('{"from":"quick"}')
    expect(calls[0].url).toContain('/models/main-model:')
    expect(calls[1].url).toContain('/models/quick-model:')
    expect(answered.meta).toMatchObject({ model: 'quick-model', answeredBy: 'base', spared: true })
  })

  it('does not ask Advanced again until its quota resets', async () => {
    let time = 0
    const { impl, calls } = fakeFetch([dailyQuota(), json(reply('{"n":1}')), json(reply('{"n":2}')), json(reply('{"n":3}'))])
    const caller = createGeminiCaller({ apiKey: 'k', ...both, now: () => time, fetchImpl: impl })
    await caller(advancedRequest)
    await caller(advancedRequest)
    expect(calls.map((c) => (c.url.includes('main-model') ? 'advanced' : 'quick'))).toEqual(['advanced', 'quick', 'quick'])
    time = 18_494_001 // the quota has reset, so Advanced is tried again
    await caller(advancedRequest)
    expect(calls[3].url).toContain('/models/main-model:')
  })

  it('falls back to Quick when Advanced stays overloaded or cannot be reached, but not for a refused key or a declined request', async () => {
    const busy = () => json({ error: { message: 'high demand' } }, 503)
    const overloaded = fakeFetch([busy(), busy(), json(reply('{"ok":1}'))])
    expect(await said(createGeminiCaller({ apiKey: 'k', ...both, overloadRetryMs: 1, fetchImpl: overloaded.impl })(advancedRequest))).toBe('{"ok":1}')

    const refused = fakeFetch([json({ error: { message: 'bad key' } }, 403), json(reply('{"ok":1}'))])
    await expect(createGeminiCaller({ apiKey: 'k', ...both, fetchImpl: refused.impl })(advancedRequest)).rejects.toMatchObject({ kind: 'bad_key' })
    expect(refused.calls).toHaveLength(1)

    const blocked = fakeFetch([json({ promptFeedback: { blockReason: 'SAFETY' } }), json(reply('{"ok":1}'))])
    await expect(createGeminiCaller({ apiKey: 'k', ...both, fetchImpl: blocked.impl })(advancedRequest)).rejects.toMatchObject({ kind: 'blocked' })
  })

  it('has no spare for Quick: when Quick cannot answer, that is reported, and Advanced is not asked in its place', async () => {
    const quick = fakeFetch([dailyQuota(), json(reply('{"ok":1}'))])
    await expect(createGeminiCaller({ apiKey: 'k', ...both, fetchImpl: quick.impl })(request)).rejects.toMatchObject({ kind: 'quota' })
    expect(quick.calls).toHaveLength(1)
    expect(quick.calls[0].url).toContain('/models/quick-model:')
  })

  it('reports the quota when both models are used up, or when they are the same model', async () => {
    const { impl } = fakeFetch([dailyQuota(), dailyQuota()])
    await expect(createGeminiCaller({ apiKey: 'k', ...both, fetchImpl: impl })(advancedRequest)).rejects.toMatchObject({ kind: 'quota' })
    const same = fakeFetch([dailyQuota()])
    await expect(createGeminiCaller({ apiKey: 'k', baseModel: 'a', advancedModel: 'a', fetchImpl: same.impl })(advancedRequest)).rejects.toMatchObject({ kind: 'quota' })
    expect(same.calls).toHaveLength(1)
  })
})
