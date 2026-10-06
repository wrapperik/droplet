import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

// An honest record of how often the model gave a valid answer, needed a retry, or fell back (manifesto principle 5).
// Stand-in for the `compositions` table: one JSON line per request, on this machine only, in a git-ignored folder.
export type CompositionLogEntry = {
  at: string
  // What the founder asked. It is kept in the log on this machine only. The deployed function never stores it (see composeEdge.ts).
  intent: string
  outcome: 'valid' | 'retried' | 'fallback' | 'error'
  task?: string
  // The mode the founder asked for, and the one that answered (Quick answers an Advanced request when Google's model is busy).
  mode?: 'base' | 'advanced'
  answeredBy?: 'base' | 'advanced'
  // Which model answered.
  model?: string
  // The tokens the request used, as the API counts them, all replies added up. Never shown to founders.
  tokens?: { prompt: number; answer: number; thinking: number }
  // How many actions the turn carried.
  actions?: number
  // How many replies were not usable, and why, for the first few.
  badReplies?: number
  problems?: string[]
  error?: string
  // How many of the model's replies searched the web.
  searches?: number
  // Search was asked for and the API refused it, so the model answered without.
  searchRefused?: boolean
  ms: number
}

export const LOG_FILE = '.droplet/compositions.jsonl'

export async function appendComposition(entry: CompositionLogEntry, file: string = LOG_FILE): Promise<void> {
  try {
    await mkdir(dirname(file), { recursive: true })
    await appendFile(file, `${JSON.stringify(entry)}\n`)
  } catch {
    // Logging must never break a request.
  }
}
