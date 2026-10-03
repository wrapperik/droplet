import { openWorkspace } from '../lib/workspaceState.ts'
import { snapshotOfState } from './snapshot.ts'
import type { Turn, WorkspaceSnapshot } from './spec.ts'

// Valid replies and a workspace to send them against, for tests and for the eval script's offline checks.
export const validOpenTurn: Turn = {
  task: 'brand',
  message: 'I chose warm clay and cream tones for a gift box business, with a deep brown for text.',
  actions: [
    {
      type: 'set_palette',
      colours: [
        { hex: '#F7EFE6', name: 'Cream', rationale: 'A soft background that feels like tissue paper.', role: 'background' },
        { hex: '#3B2A22', name: 'Deep cocoa', rationale: 'A dark brown that is easy to read on cream.', role: 'text' },
        { hex: '#B5543A', name: 'Warm clay', rationale: 'Echoes the clay and ceramics your makers sell.', role: 'primary' },
        { hex: '#D9A441', name: 'Honey', rationale: 'A warm accent for ribbons and highlights.', role: 'accent' },
      ],
      reason: 'The colours you asked for, with a role for each.',
      businessName: 'Kindred Gifting',
    },
  ],
  memoryUsed: [],
}

export const validOpenReply = JSON.stringify(validOpenTurn)

export const chatTurn: Turn = {
  task: 'chat',
  message: 'A good starting point is to price against the time each box takes you, plus the makers\' costs.',
  actions: [],
  memoryUsed: [],
}

// A workspace with the starter palette open and the default layout, as the founder would see it.
export const openSnapshot = (): WorkspaceSnapshot => {
  const state = openWorkspace([
    { id: 1, hex: '#1F8FE0', name: 'Droplet blue' },
    { id: 2, hex: '#0B4F8A' },
    { id: 3, hex: '#CFE9FB' },
    { id: 4, hex: '#0E1A2B' },
  ])
  return snapshotOfState(state, [
    { id: 'picker', col: 0, row: 0, w: 7 },
    { id: 'role', col: 7, row: 0, w: 8 },
    { id: 'generate', col: 15, row: 0, w: 8 },
    { id: 'canvas', col: 0, row: 10, w: 24 },
    { id: 'preview', col: 0, row: 30, w: 12 },
  ], 'none')
}
