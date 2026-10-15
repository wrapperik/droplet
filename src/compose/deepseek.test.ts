import { describe, expect, it } from 'vitest'
import { ComposeError } from './compose.ts'
import { createDeepSeekCaller, DEFAULT_DEEPSEEK_MODEL } from './deepseek.ts'
import { chatTurn } from './fixtures.ts'
import { composeWorkspace } from './compose.ts'

const request = { system: 'You are the composer.', user: '<request>\nhi\n</request>', schema: { type: 'object', properties: { task: { type: 'string' } } } }
const reply = (content: string, extra: object = {}) => ({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 40 }, ...extra })
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
const bodyOf = (call: Call) => JSON.parse(String(call.init.body)) as { model: string; messages: { role: string; content: string }[]; response_format: unknown }

describe('the DeepSeek caller', () => {
  it('sends the key in a header only, asks for JSON, and writes the schema into the instructions', async () => {
    const { impl, calls } = fakeFetch([json(reply('{"task":"chat"}'))])
    const answer = await createDeepSeekCaller({ apiKey: 'SECRET-KEY', fetchImpl: impl })(request)
    expect(typeof answer === 'string' ? answer : answer.text).toBe('{"task":"chat"}')
    const { url, init } = calls[0]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect(url).not.toContain('SECRET-KEY')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer SECRET-KEY')
    expect(String(init.body)).not.toContain('SECRET-KEY')
    const body = bodyOf(calls[0])
    expect(body.model).toBe(DEFAULT_DEEPSEEK_MODEL)
    expect(body.response_format).toEqual({ type: 'json_object' })
    // thinking is off by default: much faster
    expect((body as unknown as { thinking: unknown }).thinking).toEqual({ type: 'disabled' })
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toContain('You are the composer.')
    expect(body.messages[0].content).toMatch(/JSON schema/)
    expect(body.messages[0].content).toContain('"task"')
    expect(body.messages[1]).toEqual({ role: 'user', content: request.user })
  })

  it('can be asked to think, with an effort, and only then sends one', async () => {
    const on = fakeFetch([json(reply('{}'))])
    await createDeepSeekCaller({ apiKey: 'k', thinking: 'enabled', reasoningEffort: 'low', fetchImpl: on.impl })(request)
    expect(bodyOf(on.calls[0])).toMatchObject({ thinking: { type: 'enabled' }, reasoning_effort: 'low' })
    const off = fakeFetch([json(reply('{}'))])
    await createDeepSeekCaller({ apiKey: 'k', reasoningEffort: 'high', fetchImpl: off.impl })(request)
    expect(bodyOf(off.calls[0])).toMatchObject({ thinking: { type: 'disabled' } })
    expect(bodyOf(off.calls[0])).not.toHaveProperty('reasoning_effort')
  })

  it('says which model answered, and the tokens used', async () => {
    const { impl } = fakeFetch([json(reply('{}'))])
    const answer = await createDeepSeekCaller({ apiKey: 'k', model: 'deepseek-reasoner', fetchImpl: impl })(request)
    expect(answer).toMatchObject({ meta: { model: 'deepseek-reasoner', answeredBy: 'base', usage: { prompt: 120, answer: 40, thinking: 0 } } })
  })

  it('is given the version of the request that says search is not available, since it never searches', async () => {
    const { impl, calls } = fakeFetch([json(reply('{}'))])
    await createDeepSeekCaller({ apiKey: 'k', fetchImpl: impl })({ ...request, user: 'search is available', userWithoutSearch: 'search is NOT available', search: true, mode: 'advanced' })
    expect(bodyOf(calls[0]).messages[1].content).toBe('search is NOT available')
  })

  it('sends a picture as an image block with its data address, and a PDF as a file block, beside the words', async () => {
    const { impl, calls } = fakeFetch([json(reply('{}'))])
    await createDeepSeekCaller({ apiKey: 'k', fetchImpl: impl })({ ...request, files: [{ mime: 'image/png', data: 'PIXELS' }, { mime: 'application/pdf', data: 'PDFDATA' }] })
    const content = bodyOf(calls[0]).messages[1].content as unknown as Record<string, unknown>[]
    expect(content[0]).toEqual({ type: 'text', text: request.user })
    expect(content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,PIXELS' } })
    expect(content[2]).toEqual({ type: 'file', file: { filename: 'attachment.pdf', file_data: 'data:application/pdf;base64,PDFDATA' } })
    // the system message is still plain words: the API takes images only from the user
    expect(typeof bodyOf(calls[0]).messages[0].content).toBe('string')
  })

  it('sends plain words, not blocks, when there are no files', async () => {
    const { impl, calls } = fakeFetch([json(reply('{}'))])
    await createDeepSeekCaller({ apiKey: 'k', fetchImpl: impl })(request)
    expect(typeof bodyOf(calls[0]).messages[1].content).toBe('string')
  })

  it('tries once more without the files when the API refuses them, and tells the model it could not see them', async () => {
    const { impl, calls } = fakeFetch([json({ error: { message: 'unsupported file type' } }, 400), json(reply('{"ok":true}'))])
    const answer = await createDeepSeekCaller({ apiKey: 'k', fetchImpl: impl })({ ...request, files: [{ mime: 'application/pdf', data: 'SECRETPDF' }] })
    expect(typeof answer === 'string' ? answer : answer.text).toBe('{"ok":true}')
    expect(calls).toHaveLength(2)
    const second = JSON.stringify(bodyOf(calls[1]))
    expect(second).toContain('files_not_readable')
    expect(second).toMatch(/could not be given this time/)
    expect(second).not.toContain('SECRETPDF')
  })

  it('does not retry a 400 that has no files in it, since there is nothing to take out', async () => {
    const { impl, calls } = fakeFetch([json({ error: { message: 'bad' } }, 400)])
    await expect(createDeepSeekCaller({ apiKey: 'k', fetchImpl: impl })(request)).rejects.toMatchObject({ kind: 'bad_request' })
    expect(calls).toHaveLength(1)
  })

  it('tries once more after a busy server, and says so when it still fails', async () => {
    const busy = fakeFetch([json({}, 503), json(reply('{"ok":true}'))])
    const answer = await createDeepSeekCaller({ apiKey: 'k', fetchImpl: busy.impl, overloadRetryMs: 1 })(request)
    expect(typeof answer === 'string' ? answer : answer.text).toBe('{"ok":true}')
    expect(busy.calls).toHaveLength(2)
    const stillBusy = fakeFetch([json({}, 503), json({}, 503)])
    await expect(createDeepSeekCaller({ apiKey: 'k', fetchImpl: stillBusy.impl, overloadRetryMs: 1 })(request)).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it.each([
    [401, 'bad_key'],
    [402, 'quota'],
    [404, 'bad_model'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [400, 'bad_request'],
  ])('turns a %i into %s, without the key or the service\'s own words', async (status, kind) => {
    const { impl } = fakeFetch([json({ error: { message: 'internal detail Bearer SECRET' } }, status)])
    const failure = await createDeepSeekCaller({ apiKey: 'SECRET', fetchImpl: impl })(request).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(ComposeError)
    expect((failure as ComposeError).kind).toBe(kind)
    if (kind !== 'bad_request') expect((failure as ComposeError).message).not.toContain('SECRET')
  })

  it('says an account with no balance needs topping up, or switching back', async () => {
    const { impl } = fakeFetch([json({}, 402)])
    const failure = (await createDeepSeekCaller({ apiKey: 'k', fetchImpl: impl })(request).catch((error: unknown) => error)) as ComposeError
    expect(failure.message).toMatch(/no balance left.*AI_PROVIDER back to gemini/)
  })

  it('reports a timeout and a network failure', async () => {
    const aborted = fakeFetch([Object.assign(new Error('aborted'), { name: 'AbortError' })])
    await expect(createDeepSeekCaller({ apiKey: 'k', fetchImpl: aborted.impl })(request)).rejects.toMatchObject({ kind: 'timeout' })
    const down = fakeFetch([new TypeError('fetch failed')])
    await expect(createDeepSeekCaller({ apiKey: 'k', fetchImpl: down.impl })(request)).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('reports a reply the model declined', async () => {
    const { impl } = fakeFetch([json({ choices: [{ message: { content: '' }, finish_reason: 'content_filter' }] })])
    await expect(createDeepSeekCaller({ apiKey: 'k', fetchImpl: impl })(request)).rejects.toMatchObject({ kind: 'blocked' })
  })

  it('works in the composition loop: a good reply is accepted, and the same checks apply as for any model', async () => {
    const good = fakeFetch([json(reply(JSON.stringify(chatTurn)))])
    const result = await composeWorkspace({ intent: 'How should I price a gift box?' }, createDeepSeekCaller({ apiKey: 'k', fetchImpl: good.impl }))
    expect(result.outcome).toBe('valid')
    expect(result.turn.task).toBe('chat')
    // a reply that is not an acceptable turn is sent back once with the reasons, and then the fixed fallback is used
    const bad = fakeFetch([json(reply('{"task":"nonsense"}')), json(reply('not json at all'))])
    const fallback = await composeWorkspace({ intent: 'hi' }, createDeepSeekCaller({ apiKey: 'k', fetchImpl: bad.impl }))
    expect(fallback.outcome).toBe('fallback')
    expect(bad.calls).toHaveLength(2)
    expect(bodyOf(bad.calls[1]).messages[1].content).toContain('validation_errors')
  })
})
