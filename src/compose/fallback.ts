import type { PaletteBlock } from '../lib/palette.ts'
import type { Task, Turn } from './spec.ts'

// What is used when the model cannot give a usable answer twice. It does as little as possible, and never opens a workspace: with one open it
// changes nothing, and with none open it says so and asks again. The task menu still opens each task's fixed layout (the familiar path), so
// the product works with the model out of the picture.

export const FALLBACK_NOTE = 'A simpler answer was used because I could not work out your request.'

export const STARTER_PALETTE = [
  { hex: '#1F8FE0', name: 'Droplet blue', rationale: 'A clear, friendly blue that works as a main colour.', role: 'primary' as const },
  { hex: '#0B4F8A', name: 'Deep water', rationale: 'A darker blue for emphasis and buttons.', role: 'accent' as const },
  { hex: '#CFE9FB', name: 'Pale ripple', rationale: 'A light tint that gives text room on a background.', role: 'background' as const },
  { hex: '#0E1A2B', name: 'Ink', rationale: 'A near-black that is easy to read on the light tint.', role: 'text' as const },
]

// Always a conversation: naming a task would say a workspace is being opened, and the fallback opens none.
export function fallbackTurn(_task: Task | undefined, workspaceOpen: boolean): Turn {
  if (workspaceOpen) {
    return { task: 'chat', message: 'I could not work out what to change, so I changed nothing. Try asking in different words.', actions: [], memoryUsed: [] }
  }
  return {
    task: 'chat',
    message: 'I could not quite catch that one, and I would rather ask than guess. Could you say it another way? If you would rather pick a task yourself, the plus beside the message bar opens the menu.',
    actions: [],
    memoryUsed: [],
  }
}

// The starter palette as blocks, for the task menu's fixed brand layout.
export const starterBlocks = (): PaletteBlock[] =>
  STARTER_PALETTE.map((colour, index) => ({ id: index + 1, hex: colour.hex, name: colour.name, note: colour.rationale, role: colour.role }))
