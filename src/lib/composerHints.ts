import { isFrame, isNode, type BoardItem } from './boardTypes.ts'
import { frameOf } from './boardFrames.ts'
import { pairResult, resolveRoles, type PaletteBlock } from './palette.ts'

// The message bar reads the room: what to say in the empty field, what is selected, and a few chips of things worth asking for or doing next. All of it is
// worked out in code from what is on screen, with no model call, and none of it acts: a chip only fills in a request that the founder sends by pressing it.
// Kept free of anything from the interface.

export type RoomView = 'brand' | 'invoice' | 'board'

export type Room = {
  view?: RoomView
  // The board's items and which are selected, when the board is on screen.
  board?: { items: BoardItem[]; selected: BoardItem[] }
  // The palette's colours, when it is on screen.
  palette?: { blocks: PaletteBlock[]; selectedPosition?: number }
  // The invoice on screen: whether its client is named, its number, and how many clients the project remembers.
  invoice?: { clientNamed: boolean; number: string }
  savedClients?: number
  hasPalette?: boolean
  hasLogo?: boolean
  // The latest saved invoice that is ready to export and has not been, if there is one.
  exportable?: { number: string } | null
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

// The nodes on the board that are in no frame.
const loose = (items: BoardItem[]) => items.filter(isNode).filter((item) => frameOf(items, item) === null && (item.text.trim() !== '' || item.kind !== 'note'))

// What the empty field says. Follows what the founder is doing.
export function placeholderFor(room: Room): string {
  if (room.view === 'board' && room.board) {
    const { selected } = room.board
    if (selected.length === 1 && isFrame(selected[0])) return 'Ask about the selected frame'
    const nodes = selected.filter(isNode)
    if (nodes.length === 1 && selected.length === 1) return 'Ask about the selected note'
    if (nodes.length > 1 && nodes.length === selected.length) return `Ask about the ${nodes.length} selected notes`
    return room.board.items.length === 0 ? 'Say what you are thinking about, and I will start the board' : 'Ask for ideas, or to group or tidy the board'
  }
  if (room.view === 'invoice' && room.invoice) return room.invoice.clientNamed ? 'Add a line, or change the terms' : 'Who is this invoice for?'
  if (room.view === 'brand') return room.palette?.selectedPosition ? `Ask about colour ${room.palette.selectedPosition}, or describe the feeling you want` : 'Describe the feeling you want'
  return 'Write your message...'
}

// "2 notes selected": what is selected on the board, and a way to clear it. Null when nothing is.
export function selectionLabel(room: Room): string | null {
  const selected = room.board?.selected ?? []
  if (room.view !== 'board' || selected.length === 0) return null
  if (selected.every((item) => item.kind === 'note')) return `${plural(selected.length, 'note', 'notes')} selected`
  if (selected.every(isFrame)) return `${plural(selected.length, 'frame', 'frames')} selected`
  if (selected.every((item) => item.kind === 'connector')) return `${plural(selected.length, 'arrow', 'arrows')} selected`
  return `${plural(selected.length, 'thing', 'things')} selected`
}

export type Hint = {
  id: string
  // On the chip.
  label: string
  // What pressing it sends, as the founder's own message.
  text: string
  // A nudge is something to do now, and can be dismissed. A hint is a way in.
  kind: 'nudge' | 'hint'
}

// The most chips shown at once.
export const MAX_HINTS = 3

// A nudge is a thing worth doing now, found in code. It is offered once, never done until pressed, and a dismissed one stays away for that workspace.
export const LOOSE_NOTES_NUDGE = 12

export function nudgesFor(room: Room): Hint[] {
  const nudges: Hint[] = []
  if (room.view === 'brand' && room.palette && room.palette.blocks.length >= 2) {
    const roles = resolveRoles(room.palette.blocks)
    if (pairResult(roles.text.hex, roles.background.hex).level === 'fail') {
      nudges.push({ id: 'contrast', label: 'Fix the contrast?', text: 'Fix the contrast between my text and background colours', kind: 'nudge' })
    }
  }
  if (room.view === 'board' && room.board && loose(room.board.items).length >= LOOSE_NOTES_NUDGE) {
    nudges.push({ id: 'loose', label: 'Group these?', text: 'Group my loose notes by theme', kind: 'nudge' })
  }
  if (room.view && room.exportable) {
    nudges.push({ id: `export:${room.exportable.number}`, label: `Export ${room.exportable.number}?`, text: `Export ${room.exportable.number} as a PDF`, kind: 'nudge' })
  }
  return nudges
}

// The chips above the bar: nudges not yet dismissed, then ways in that suit the stage. `dismissed` holds `view:id`.
export function hintsFor(room: Room, dismissed: ReadonlySet<string> = new Set()): Hint[] {
  const hints: Hint[] = nudgesFor(room).filter((nudge) => !dismissed.has(dismissKey(room, nudge)))
  if (room.view === 'board' && room.board && room.board.items.length === 0) {
    hints.push(
      { id: 'names', label: 'Brainstorm names', text: 'Brainstorm some name ideas for my business', kind: 'hint' },
      { id: 'customer', label: 'Customer template', text: 'Put the customer and problem template on the board', kind: 'hint' },
      { id: 'interview', label: 'Interview me', text: 'Interview me to fill this in, one question at a time', kind: 'hint' },
    )
  }
  if (room.view === 'invoice' && room.invoice && !room.invoice.clientNamed && (room.savedClients ?? 0) > 0) {
    hints.push({ id: 'saved-client', label: 'Use a saved client', text: 'Use a saved client for this invoice', kind: 'hint' })
  }
  if (room.view === 'brand' && room.hasPalette && !room.hasLogo) {
    hints.push({ id: 'logo-brief', label: 'Make the logo brief', text: 'Put together a brief for my logo', kind: 'hint' })
  }
  return hints.slice(0, MAX_HINTS)
}

// How a dismissed chip is remembered: by workspace, so dismissing one in the palette does not hide the same kind on the board.
export const dismissKey = (room: Pick<Room, 'view'>, hint: Pick<Hint, 'id'>) => `${room.view ?? 'none'}:${hint.id}`
