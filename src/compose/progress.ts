import { z } from 'zod'

// What the composer says about how far it has got while it works: the stage and nothing else, never what the founder wrote or what the model
// answered. The server sends these as server-sent events ahead of the reply, so the founder can see that Droplet is working and on what. Advanced
// takes several seconds, and a screen that says only "Thinking" for that long looks stuck.
//
// Kept free of anything from the interface, so the server can use it too.

export const stageSchema = z.discriminatedUnion('stage', [
  // Asking the model. `search` is true when it may look things up (Advanced), which it decides for itself.
  z.object({ stage: z.literal('reading'), search: z.boolean().optional() }),
  // The server is working out what to search for, from the request and what it knows of the business.
  z.object({ stage: z.literal('planning') }),
  // The server is searching the web because the founder asked for research. The query is the founder's own words (see webSearch.ts).
  z.object({ stage: z.literal('searching'), query: z.string().max(200) }),
  // The model answered. If it searched the web, what for (from the API's own metadata, not from the model's words).
  z.object({ stage: z.literal('checking'), searched: z.array(z.string().max(120)).max(5).optional() }),
  // The first reply was not usable, so the model is asked once more with the reasons.
  z.object({ stage: z.literal('retrying') }),
])
export type ComposeStage = z.infer<typeof stageSchema>

// After this long the elapsed seconds are shown beside the stage, so a slow answer is seen to be moving.
export const SECONDS_SHOWN_AFTER = 5

// Stages the browser knows for itself, besides the ones the server reports: gathering what is saved before the request goes, opening a workspace the reply asked
// for, and making the changes it came with.
export type ShownStage = ComposeStage | { stage: 'gathering' } | { stage: 'opening'; workspace: string } | { stage: 'applying'; where: string }

// What the words can say that the stage alone cannot, all of it from what is really happening: what the reply is being made from, and which workspace it is
// about. Both are worked out in code from the request, never from the model.
export type StageContext = { from?: string; where?: string }

// The most of a search that is shown in the line.
const MAX_QUERY_SHOWN = 40
const shorten = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`)

// A stage in words, for the thread: "Reading your message alongside the board on screen and 2 earlier chats".
export function stageWords(stage: ShownStage, context: StageContext = {}): string {
  switch (stage.stage) {
    case 'gathering':
      return 'Looking at what is saved in this project'
    case 'reading': {
      const from = context.from ? `Reading your message alongside ${context.from}` : 'Reading your message'
      return stage.search ? `${from}, and looking things up if needed` : from
    }
    case 'planning':
      return 'Working out what to search for'
    case 'searching':
      return `Searching the web for “${shorten(stage.query, MAX_QUERY_SHOWN)}”`
    case 'checking': {
      const checked = context.where ? `Checking the reply fits ${context.where}` : 'Checking the reply'
      // A long search is cut, so the line stays short.
      return stage.searched && stage.searched.length > 0 ? `Searched the web for “${shorten(stage.searched[0], MAX_QUERY_SHOWN)}”. ${checked}` : checked
    }
    case 'retrying':
      return 'The first reply did not fit, so I am asking again with what was wrong'
    case 'opening':
      return `Opening ${stage.workspace}`
    case 'applying':
      return `Making the changes on ${stage.where}`
  }
}

// The seconds elapsed, once there are enough to be worth showing: "6s". Empty before that. Kept apart from the words so a screen reader is not told
// the time every second.
export const elapsedLabel = (elapsedSeconds: number) => (elapsedSeconds >= SECONDS_SHOWN_AFTER ? `${Math.floor(elapsedSeconds)}s` : '')

// Both together, as one line.
export function stageText(stage: ShownStage, elapsedSeconds = 0, context: StageContext = {}): string {
  const elapsed = elapsedLabel(elapsedSeconds)
  return elapsed ? `${stageWords(stage, context)} · ${elapsed}` : stageWords(stage, context)
}
