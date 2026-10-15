// Runs the fixed test requests against the real model and prints how it went. Run it before changing the model, and
// after changing the prompt. It needs a key:  node --env-file=.env scripts/eval-compose.ts
//
//   node --env-file=.env scripts/eval-compose.ts            all requests
//   node --env-file=.env scripts/eval-compose.ts act-hide   only the ones whose id contains "act-hide"
//
// EVAL_MODE picks the model, as the founder does in the app: "base" (the default) is Quick, "advanced" is the stronger model with Google Search.
// The models are GEMINI_BASE_MODEL and GEMINI_ADVANCED_MODEL.
//
// The free tier is rate limited, so requests run one after another with a pause between them.

import { mkdir, writeFile } from 'node:fs/promises'
import { composeWorkspace, ComposeError } from '../src/compose/compose.ts'
import type { ModelCaller } from '../src/compose/compose.ts'
import type { Mode } from '../src/compose/spec.ts'
import { callerFromEnv } from '../server/composeEnv.ts'
import { TEST_REQUESTS, type TestRequest } from '../src/compose/testRequests.ts'

const configured = callerFromEnv(process.env)
if (!configured.call) {
  console.error('No API key. Set GEMINI_API_KEY (or AI_PROVIDER=deepseek and DEEPSEEK_API_KEY). Run with: node --env-file=.env scripts/eval-compose.ts')
  process.exit(1)
}
const call: ModelCaller = configured.call
const mode: Mode = process.env.EVAL_MODE?.trim() === 'advanced' ? 'advanced' : 'base'
const model = mode === 'advanced' ? configured.advancedModel : configured.baseModel

const filter = process.argv[2]
// Advanced may search the web, as in the app. Each search counts against the key's monthly searches.
const search = mode === 'advanced'
const requests = filter ? TEST_REQUESTS.filter((test) => test.id.includes(filter)) : TEST_REQUESTS
const PAUSE_MS = Number(process.env.EVAL_PAUSE_MS) || 4000
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Row = { id: string; outcome: string; task: string; actions: string; pass: boolean; problems: string[]; seconds: number; message: string; question?: string; replies?: string[]; title?: string; opens?: string; blocks?: string; retried?: string[]; searched?: string }

async function run(test: TestRequest): Promise<Row> {
  const started = Date.now()
  try {
    const result = await composeWorkspace({ ...test.request, mode }, call)
    const { turn } = result
    const problems: string[] = []
    if (result.outcome === 'fallback') problems.push('fell back after two unusable replies')
    const wantedTasks = Array.isArray(test.expect.task) ? test.expect.task : [test.expect.task]
    if (!wantedTasks.includes(turn.task)) problems.push(`task was "${turn.task}", expected "${wantedTasks.join('" or "')}"`)
    if (test.expect.acts !== undefined && test.expect.acts !== turn.actions.length > 0) problems.push(test.expect.acts ? 'expected actions, got none' : 'expected no actions, got some')
    if (test.expect.opens !== undefined && test.expect.opens !== Boolean(turn.opens)) problems.push(test.expect.opens ? 'expected it to open a workspace, with the founder\'s words quoted, and it did not' : `it opened a workspace the founder did not ask for (${turn.opens?.because}: "${turn.opens?.quote}")`)
    if (search && test.expect.searches !== undefined && test.expect.searches !== Boolean(result.grounding)) problems.push(test.expect.searches ? 'expected it to search the web, and it did not' : `it searched the web when it did not need to (${result.grounding?.queries.join('; ')})`)
    const shown = (turn.blocks ?? []).map((block) => block.type)
    if (test.expect.blocks === 'none' && shown.length > 0) problems.push(`expected no table or checklist, got ${shown.join(', ')}`)
    if (test.expect.blocks && test.expect.blocks !== 'none' && !shown.includes(test.expect.blocks)) problems.push(`expected a ${test.expect.blocks}, got ${shown.join(', ') || 'none'}`)
    if (test.expect.firstAction && !test.expect.firstAction.includes(turn.actions[0]?.type ?? 'none')) {
      problems.push(`first action was "${turn.actions[0]?.type ?? 'none'}", expected one of ${test.expect.firstAction.join(', ')}`)
    }
    if (test.expect.addsNotes !== undefined) {
      const writes = turn.actions.filter((action) => action.type === 'add_note' || action.type === 'fill_prompt' || action.type === 'add_template').length
      if (writes < test.expect.addsNotes) problems.push(`expected at least ${test.expect.addsNotes} notes written, got ${writes}`)
    }
    if (test.expect.noPrice && JSON.stringify(turn.actions).includes('unitPrice')) problems.push('an action set a price, but the founder gave none')
    if (test.expect.asks !== undefined && test.expect.asks !== Boolean(turn.question)) problems.push(test.expect.asks ? 'expected a follow-up question, got none' : 'expected no question, got one')
    if (test.expect.titles !== undefined && test.expect.titles !== Boolean(turn.title)) problems.push(test.expect.titles ? 'expected a title for the chat, got none' : 'expected no title, got one')
    if (test.expect.list && shown.length === 0 && !/^\s*(?:[-*•]|\d+[.)])\s/m.test(turn.message)) problems.push('expected the message to be laid out as a list, or a table or checklist')
    if (mode === 'base' && test.expect.saysMayBeOutOfDate && (/advanced/i.test(turn.message) || !/out of date|outdated|changed|change/i.test(turn.message))) problems.push('expected it to say the answer may be out of date, and not to point to an Advanced switch that is not there')
    if (test.expect.proposes !== undefined) {
      const offered = (turn.propose ?? []).map((proposal) => proposal.key)
      const missing = test.expect.proposes.filter((key) => !offered.includes(key))
      const extra = offered.filter((key) => !test.expect.proposes!.includes(key))
      if (missing.length > 0) problems.push(`expected it to propose ${missing.join(', ')}, and it did not`)
      if (extra.length > 0) problems.push(`it proposed ${extra.join(', ')}, which the founder did not say`)
    }
    if (test.expect.mentions) {
      const absent = test.expect.mentions.filter((word) => !turn.message.toLowerCase().includes(word.toLowerCase()))
      if (absent.length > 0) problems.push(`the message does not mention ${absent.join(', ')}`)
    }
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
      title: turn.title,
      ...(turn.opens ? { opens: `${turn.opens.because}: "${turn.opens.quote}"` } : {}),
      ...(shown.length > 0 ? { blocks: shown.join(', ') } : {}),
      ...(result.grounding ? { searched: `${result.grounding.queries.join('; ')} (${result.grounding.sources.length} sources)` } : {}),
      // Why the first reply was refused, when it was, so a prompt can be fixed from the evidence.
      ...(result.attempts.some((attempt) => attempt.errors.length > 0) ? { retried: result.attempts.flatMap((attempt) => attempt.errors).slice(0, 4) } : {}),
    }
  } catch (error) {
    const kind = error instanceof ComposeError ? error.kind : 'error'
    return { id: test.id, outcome: 'error', task: '-', actions: '-', pass: false, problems: [`could not get an answer (${kind})`], seconds: (Date.now() - started) / 1000, message: '' }
  }
}

console.log(`Mode: ${mode === 'advanced' ? 'Advanced' : 'Quick'}   Model: ${model}   Requests: ${requests.length}   Web search: ${search ? 'allowed' : 'off'}\n`)
const rows: Row[] = []
for (const [index, test] of requests.entries()) {
  const row = await run(test)
  rows.push(row)
  console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${row.id.padEnd(18)} ${row.outcome.padEnd(9)} ${row.task.padEnd(14)} ${row.seconds.toFixed(1).padStart(5)}s  ${row.actions}`)
  for (const problem of row.problems) console.log(`        - ${problem}`)
  if (row.message) console.log(`        "${row.message.replace(/\n+/g, ' / ').slice(0, 220)}${row.message.length > 220 ? '...' : ''}"`)
  if (row.title) console.log(`        title: ${row.title}`)
  for (const reason of row.retried ?? []) console.log(`        refused: ${reason.slice(0, 200)}`)
  if (row.searched) console.log(`        searched: ${row.searched}`)
  if (row.opens) console.log(`        opens (${row.opens})`)
  if (row.blocks) console.log(`        shows: ${row.blocks}`)
  if (row.question) console.log(`        ? ${row.question}${row.replies?.length ? `  [${row.replies.join(' | ')}]` : ''}`)
  if (index < requests.length - 1) await sleep(PAUSE_MS)
}

const count = (outcome: string) => rows.filter((row) => row.outcome === outcome).length
console.log(`\nPassed ${rows.filter((row) => row.pass).length} of ${rows.length}.`)
console.log(`Valid first time: ${count('valid')}   Retried: ${count('retried')}   Fallback: ${count('fallback')}   Errors: ${count('error')}`)

await mkdir('.droplet', { recursive: true })
const file = `.droplet/eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
await writeFile(file, JSON.stringify({ mode, model, at: new Date().toISOString(), rows }, null, 2))
console.log(`Results saved to ${file}`)
