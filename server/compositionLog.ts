import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

// An honest record of how often the model gave a valid answer, needed a retry, or fell back (manifesto principle 5).
// Stand-in for the `compositions` table: one JSON line per request, on this machine only, in a git-ignored folder.
export type CompositionLogEntry = {
  at: string
  intent: string
  outcome: 'valid' | 'retried' | 'fallback' | 'error'
  task?: string
  // Which model answered (the main one, or the fallback).
  model?: string
  // How many actions the turn carried.
  actions?: number
  // How many replies were not usable, and why, for the first few.
  badReplies?: number
  problems?: string[]
  error?: string
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
