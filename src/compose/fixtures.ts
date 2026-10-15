import { emptyClient, newContent } from '../lib/invoice.ts'
import { openInvoiceWorkspace } from '../lib/invoiceState.ts'
import { emptyMemory, withClient } from '../lib/projectMemory.ts'
import { openWorkspace } from '../lib/workspaceState.ts'
import { openBoard, reduceBoard, type BoardState } from '../lib/boardState.ts'
import { groupFor, instantiateTemplate, templateById } from '../lib/boardTemplates.ts'
import type { BoardItem } from '../lib/boardTypes.ts'
import { snapshotOfBoard } from './boardSnapshot.ts'
import type { BoardSnapshot } from './boardSpec.ts'
import { snapshotOfInvoice } from './invoiceSnapshot.ts'
import type { InvoiceSnapshot } from './invoiceSpec.ts'
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
  opens: { because: 'asked', quote: 'palette' },
  memoryUsed: [],
}

export const validOpenReply = JSON.stringify(validOpenTurn)

export const chatTurn: Turn = {
  task: 'chat',
  message: 'A good starting point is to price against the time each box takes you, plus the makers\' costs.',
  actions: [],
  memoryUsed: [],
}

// A workspace with the starter palette open, as the founder would see it.
export const openSnapshot = (): WorkspaceSnapshot => {
  const state = openWorkspace([
    { id: 1, hex: '#1F8FE0', name: 'Droplet blue' },
    { id: 2, hex: '#0B4F8A' },
    { id: 3, hex: '#CFE9FB' },
    { id: 4, hex: '#0E1A2B' },
  ])
  return snapshotOfState(state, 'none')
}

// A new invoice open in the workspace, dated 4 October 2026, in a project that remembers one client.
export const openInvoiceSnapshot = (): InvoiceSnapshot => {
  const memory = withClient(emptyMemory(), { ...emptyClient(), name: 'Pretoria Print Works', address: '5 Church Square' }, '2026-10-01T10:00', 'c1')
  return snapshotOfInvoice(openInvoiceWorkspace(newContent('2026-10-04', 'INV-0007'), 'i1'), memory, '2026-10-04')
}

// A board with a frame of name ideas holding two notes, and three loose notes about the business, as the founder might have left it. The first
// loose note is selected, unless others are given.
export const openBoardState = (): BoardState => {
  const note = (id: string, x: number, y: number, text: string): BoardItem => ({ id, kind: 'note', x, y, w: 200, h: 180, text, colour: 'yellow', author: 'you' })
  return openBoard([
    { id: 'names', kind: 'frame', x: 1000, y: 1000, w: 1000, h: 560, title: 'Name ideas', colour: 'lilac' },
    note('a', 1060, 1060, 'Kindred Gifting'),
    note('b', 1340, 1060, 'Maker Box'),
    note('c', 2400, 1000, 'Corporate clients in Pretoria'),
    note('d', 2400, 1300, 'Boxes from R200 to R500'),
    note('e', 2400, 1600, 'Only local makers'),
  ])
}

export const emptyBoardSnapshot = (): BoardSnapshot => snapshotOfBoard(openBoard(), { x: 2400, y: 1600 }, 'none')

export const openBoardSnapshot = (selected: string[] = ['c']): BoardSnapshot => {
  const state = reduceBoard(openBoardState(), { type: 'select', ids: selected })
  return snapshotOfBoard(state, { x: 2200, y: 1400 }, 'none')
}

// A board with the customer and problem template put on it and nothing filled in, so every prompt is empty.
export const templateBoardSnapshot = (): BoardSnapshot => {
  let n = 0
  const template = templateById('customer_problem')!
  const items = instantiateTemplate(template, { x: 600, y: 600 }, () => `t${++n}`, groupFor(template.id, 'one'))
  const state = openBoard(items)
  return snapshotOfBoard(state, { x: 1400, y: 1000 }, 'none')
}
