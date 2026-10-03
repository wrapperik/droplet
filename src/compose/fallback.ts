import type { PaletteBlock } from '../lib/palette.ts'
import type { Task, Turn } from './spec.ts'

// What is used when the model cannot give a usable answer twice. It does as little as possible: with a workspace
// open it changes nothing, and with none open it offers the same starter palette the task menu opens (the familiar
// path), editable, with a plain note that a simpler view was used. The product works with the model out of the picture.

export const FALLBACK_NOTE = 'A simpler view was used because I could not work out your request.'

export const STARTER_PALETTE = [
  { hex: '#1F8FE0', name: 'Droplet blue', rationale: 'A clear, friendly blue that works as a main colour.', role: 'primary' as const },
  { hex: '#0B4F8A', name: 'Deep water', rationale: 'A darker blue for emphasis and buttons.', role: 'accent' as const },
  { hex: '#CFE9FB', name: 'Pale ripple', rationale: 'A light tint that gives text room on a background.', role: 'background' as const },
  { hex: '#0E1A2B', name: 'Ink', rationale: 'A near-black that is easy to read on the light tint.', role: 'text' as const },
]

export const starterTurn = (message: string): Turn => ({
  task: 'brand',
  message,
  actions: [{ type: 'set_palette', colours: STARTER_PALETTE, reason: 'A starter palette to edit, shown because a simpler view was used.' }],
  memoryUsed: [],
})

export function fallbackTurn(task: Task | undefined, workspaceOpen: boolean): Turn {
  if (workspaceOpen) {
    return { task: task ?? 'chat', message: 'I could not work out what to change, so I changed nothing. Try asking in different words.', actions: [], memoryUsed: [] }
  }
  if (!task || task === 'brand') return starterTurn('I could not build a palette from that request, so here is a starting point you can change.')
  return { task, message: 'I could not answer that just now. Try asking again in different words.', actions: [], memoryUsed: [] }
}

// The starter palette as blocks, for the task menu's fixed brand layout.
export const starterBlocks = (): PaletteBlock[] =>
  STARTER_PALETTE.map((colour, index) => ({ id: index + 1, hex: colour.hex, name: colour.name, note: colour.rationale, role: colour.role }))
