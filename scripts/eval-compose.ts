// Runs the fixed test requests against the real model and prints how it went. Run it before changing the model, and
// after changing the prompt. It needs a key:  node --env-file=.env scripts/eval-compose.ts
//
//   node --env-file=.env scripts/eval-compose.ts            all requests
//   node --env-file=.env scripts/eval-compose.ts act-hide   only the ones whose id contains "act-hide"
//
// The free tier is rate limited, so requests run one after another with a pause between them.

import { mkdir, writeFile } from 'node:fs/promises'
import { composeWorkspace, ComposeError } from '../src/compose/compose.ts'
import { createGeminiCaller, DEFAULT_MODEL } from '../src/compose/gemini.ts'
import { TEST_REQUESTS, type TestRequest } from '../src/compose/testRequests.ts'

const apiKey = process.env.GEMINI_API_KEY?.trim()
if (!apiKey) {
  console.error('No GEMINI_API_KEY. Run with: node --env-file=.env scripts/eval-compose.ts')
  process.exit(1)
}
const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL
const call = createGeminiCaller({ apiKey, model, thinkingLevel: process.env.GEMINI_THINKING_LEVEL?.trim() || undefined })

const filter = process.argv[2]
const requests = filter ? TEST_REQUESTS.filter((test) => test.id.includes(filter)) : TEST_REQUESTS
const PAUSE_MS = Number(process.env.EVAL_PAUSE_MS) || 4000
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Row = { id: string; outcome: string; task: string; actions: string; pass: boolean; problems: string[]; seconds: number; message: string; question?: string; replies?: string[] }

async function run(test: TestRequest): Promise<Row> {
  const started = Date.now()
  try {
    const result = await composeWorkspace(test.request, call)
    const { turn } = result
    const problems: string[] = []
    if (result.outcome === 'fallback') problems.push('fell back after two unusable replies')
    if (turn.task !== test.expect.task) problems.push(`task was "${turn.task}", expected "${test.expect.task}"`)
    if (test.expect.acts !== turn.actions.length > 0) problems.push(test.expect.acts ? 'expected actions, got none' : 'expected no actions, got some')
    if (test.expect.firstAction && !test.expect.firstAction.includes(turn.actions[0]?.type ?? 'none')) {
      problems.push(`first action was "${turn.actions[0]?.type ?? 'none'}", expected one of ${test.expect.firstAction.join(', ')}`)
    }
    if (test.expect.noPrice && JSON.stringify(turn.actions).includes('unitPrice')) problems.push('an action set a price, but the founder gave none')
    if (test.expect.asks !== undefined && test.expect.asks !== Boolean(turn.question)) problems.push(test.expect.asks ? 'expected a follow-up question, got none' : 'expected no question, got one')
    if (test.expect.list && !/^\s*(?:[-*•]|\d+[.)])\s/m.test(turn.message)) problems.push('expected the message to be laid out as a list')
    if (test.expect.messageMustNotInclude && turn.message.toLowerCase().includes(test.expect.messageMustNotInclude)) {
      problems.push(`the message includes "${test.expect.messageMustNotInclude}"`)
    }
    return {
      id: test.id,
      outcome: result.outcome,
      task: turn.task,
      actions: turn.actions.map((action) => action.type).join(', ') || '-',
      pass: problems.length === 0,
      problems,
      seconds: (Date.now() - started) / 1000,
      message: turn.message,
      question: turn.question,
      replies: turn.replies,
    }
  } catch (error) {
    const kind = error instanceof ComposeError ? error.kind : 'error'
    return { id: test.id, outcome: 'error', task: '-', actions: '-', pass: false, problems: [`could not get an answer (${kind})`], seconds: (Date.now() - started) / 1000, message: '' }
  }
}

console.log(`Model: ${model}   Requests: ${requests.length}\n`)
const rows: Row[] = []
for (const [index, test] of requests.entries()) {
  const row = await run(test)
  rows.push(row)
  console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${row.id.padEnd(18)} ${row.outcome.padEnd(9)} ${row.task.padEnd(14)} ${row.seconds.toFixed(1).padStart(5)}s  ${row.actions}`)
  for (const problem of row.problems) console.log(`        - ${problem}`)
  if (row.message) console.log(`        "${row.message.replace(/\n+/g, ' / ').slice(0, 220)}${row.message.length > 220 ? '...' : ''}"`)
  if (row.question) console.log(`        ? ${row.question}${row.replies?.length ? `  [${row.replies.join(' | ')}]` : ''}`)
  if (index < requests.length - 1) await sleep(PAUSE_MS)
}

const count = (outcome: string) => rows.filter((row) => row.outcome === outcome).length
console.log(`\nPassed ${rows.filter((row) => row.pass).length} of ${rows.length}.`)
console.log(`Valid first time: ${count('valid')}   Retried: ${count('retried')}   Fallback: ${count('fallback')}   Errors: ${count('error')}`)

await mkdir('.droplet', { recursive: true })
const file = `.droplet/eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
await writeFile(file, JSON.stringify({ model, at: new Date().toISOString(), rows }, null, 2))
console.log(`Results saved to ${file}`)
