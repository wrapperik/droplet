import { boundsOf, freeAreaNear, keepInside, type Point, type Size } from './boardGeometry.ts'
import { isConnector, isFrame, isRectItem, rectOf, type BoardItem, type ConnectorItem, type FounderColour, type FrameItem, type NoteItem, type ShapeColour, type ShapeItem } from './boardTypes.ts'

// Templates: a starting layout for a kind of thinking, put on the board for the founder to fill in, move, resize, recolour and cut down. A
// template is nothing but ordinary things (frames, notes, shapes and arrows), so everything that can be done to anything on the board can be
// done to it, and nothing about it is locked.
//
// The prompts are notes (and shapes) with nothing written in them and a faint hint, which shows while they are empty and goes when the founder
// writes. They guide without being in the way: they can be filled, moved, deleted or ignored.
//
// Every template is drawn from (0, 0), with its first frames at TITLE_SPACE from the top, which is room for their titles (a frame's title sits
// above it). Where it goes on the board is decided when it is put there.

export const TEMPLATE_IDS = ['brain_dump', 'customer_problem', 'offer_comparison', 'name_ideas', 'pros_cons', 'assumptions', 'business_model'] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

export type TemplateDef = {
  id: TemplateId
  name: string
  // One line on what it is for.
  summary: string
  // The room it takes, from its own top-left corner, with the titles of its frames.
  size: Size
  // In its own coordinates, with ids of its own, which are made new when it is put on the board.
  items: BoardItem[]
}

// The room above the first frames of a template, for their titles.
export const TITLE_SPACE = 60
// The clear space left round a template when it is put on the board, so it does not run into what is there, nor its titles into the frames above.
const MARGIN = 64

// ---- Building blocks ----

const frame = (id: string, x: number, y: number, w: number, h: number, title: string, colour: ShapeColour = 'white'): FrameItem => ({ id, kind: 'frame', x, y, w, h, title, colour })

// An empty note with a hint: a place to write something.
const slot = (id: string, x: number, y: number, hint: string, colour: FounderColour = 'yellow', w = 240, h = 160): NoteItem => ({ id, kind: 'note', x, y, w, h, text: '', hint, colour, author: 'you' })

const box = (id: string, x: number, y: number, w: number, h: number, shape: ShapeItem['shape'], hint: string, colour: ShapeColour = 'white'): ShapeItem => ({ id, kind: 'shape', shape, x, y, w, h, text: '', hint, colour })

const arrow = (id: string, from: string, to: string, style: ConnectorItem['style'] = 'straight', text = ''): ConnectorItem => ({ id, kind: 'connector', from: { item: from }, to: { item: to }, style, head: 'end', text })

// The room a lot of things takes, from (0, 0).
function sizeOf(items: BoardItem[]): Size {
  const box = boundsOf(items.filter(isRectItem).map(rectOf))!
  return { w: box.x + box.w, h: box.y + box.h }
}

const define = (id: TemplateId, name: string, summary: string, items: BoardItem[]): TemplateDef => ({ id, name, summary, size: sizeOf(items), items })

// ---- The templates ----

// A frame to tip every idea into, with a few prompts to start the flow.
const brainDump = (): BoardItem[] => {
  const hints = ['An idea, however rough', 'Something you could sell', 'A problem you have seen', 'A thing you wish existed', 'Something you are good at', 'A person who would pay']
  return [frame('f', 0, TITLE_SPACE, 1280, 560, 'Brain dump: every idea, however rough', 'sky'), ...hints.map((hint, i) => slot(`n${i}`, 40 + (i % 4) * 300, 120 + Math.floor(i / 4) * 200, hint))]
}

// Who it is for, what goes wrong for them, and how they cope: three frames in a line, each leading to the next.
const customerProblem = (): BoardItem[] => {
  const columns: [string, ShapeColour, [string, string]][] = [
    ['Who is it for?', 'lilac', ['Describe one real person', 'Where do you find them?']],
    ['What problem do they have?', 'peach', ['What goes wrong for them?', 'What does it cost them?']],
    ['How do they cope today?', 'mint', ['What do they use now?', 'What do they dislike about it?']],
  ]
  const items: BoardItem[] = []
  columns.forEach(([title, colour, hints], i) => {
    const x = i * 640
    items.push(frame(`f${i}`, x, TITLE_SPACE, 520, 560, title, colour), slot(`a${i}`, x + 140, 120, hints[0]), slot(`b${i}`, x + 140, 340, hints[1]))
  })
  items.push(arrow('c0', 'f0', 'f1'), arrow('c1', 'f1', 'f2'))
  return items
}

// Offers side by side, and the limits they have to fit inside. The founder weighs them: nothing here is worked out for them.
const offerComparison = (): BoardItem[] => {
  const items: BoardItem[] = []
  const hints = ['What you would sell', 'The price you would charge', 'Money needed to start', 'Weeks until the first sale']
  ;['A', 'B', 'C'].forEach((name, i) => {
    const x = i * 560
    items.push(frame(`f${i}`, x, TITLE_SPACE, 480, 760, `Offer ${name}`, 'sky'))
    hints.forEach((hint, j) => items.push(slot(`o${i}${j}`, x + 100, 120 + j * 180, hint, 'yellow', 280, 140)))
  })
  items.push(frame('limits', 0, 940, 1600, 260, 'My limits', 'grey'), slot('budget', 160, 1000, 'My budget to start (R)', 'mint'), slot('time', 560, 1000, 'Time I have each week', 'mint'))
  return items
}

// Every name that comes to mind, then a shortlist of the few worth keeping.
const nameIdeas = (): BoardItem[] => {
  const items: BoardItem[] = [frame('ideas', 0, TITLE_SPACE, 1200, 560, 'Name ideas', 'lilac')]
  for (let i = 0; i < 8; i++) items.push(slot(`n${i}`, 40 + (i % 4) * 280, 120 + Math.floor(i / 4) * 200, 'A name idea', 'lilac'))
  items.push(frame('short', 1400, TITLE_SPACE, 560, 560, 'Shortlist', 'yellow'))
  ;['Favourite', 'Second choice', 'Third choice'].forEach((hint, i) => items.push(slot(`s${i}`, 1560, 120 + i * 160, hint, 'yellow', 240, 120)))
  items.push(arrow('c', 'ideas', 'short', 'straight', 'narrow down'))
  return items
}

// A decision at the top, and the case for and against it underneath.
const prosCons = (): BoardItem[] => {
  const items: BoardItem[] = [box('choice', 440, TITLE_SPACE, 420, 160, 'rounded', 'What are you deciding?'), frame('pros', 0, 300, 600, 540, 'Pros', 'mint'), frame('cons', 700, 300, 600, 540, 'Cons', 'peach')]
  ;['A reason for', 'Another reason for', 'And another'].forEach((hint, i) => items.push(slot(`p${i}`, 180, 360 + i * 160, hint, 'mint', 240, 140)))
  ;['A reason against', 'Another reason against', 'And another'].forEach((hint, i) => items.push(slot(`c${i}`, 880, 360 + i * 160, hint, 'peach', 240, 140)))
  items.push(arrow('a0', 'choice', 'pros', 'elbow'), arrow('a1', 'choice', 'cons', 'elbow'))
  return items
}

// What is being taken for granted, and a cheap way to find out for each.
const assumptions = (): BoardItem[] => {
  const items: BoardItem[] = [frame('assume', 0, TITLE_SPACE, 640, 880, 'What I am assuming', 'lilac'), frame('test', 800, TITLE_SPACE, 640, 880, 'How I could test it', 'sky')]
  for (let i = 0; i < 4; i++) {
    items.push(slot(`a${i}`, 200, 120 + i * 200, 'Something I take for granted', 'lilac'), slot(`t${i}`, 1000, 120 + i * 200, 'A cheap way to find out', 'sky'), arrow(`c${i}`, `a${i}`, `t${i}`))
  }
  return items
}

// The nine boxes of a business model, laid out as they usually are, each with a place to start.
const businessModel = (): BoardItem[] => {
  const tall = 960
  const short = 440
  const cell = (id: string, col: number, y: number, h: number, title: string, colour: ShapeColour, hints: string[]): BoardItem[] => [
    frame(id, col * 500, y, 460, h, title, colour),
    ...hints.map((hint, i) => slot(`${id}-${i}`, col * 500 + 100, y + 60 + i * 200, hint, 'yellow')),
  ]
  const row2 = TITLE_SPACE + tall + 80
  return [
    ...cell('partners', 0, TITLE_SPACE, tall, 'Key partners', 'grey', ['Who helps you?', 'What do they provide?']),
    ...cell('activities', 1, TITLE_SPACE, short, 'Key activities', 'sky', ['What must you do every week?']),
    ...cell('resources', 1, TITLE_SPACE + short + 80, short, 'Key resources', 'sky', ['What do you need to have?']),
    ...cell('value', 2, TITLE_SPACE, tall, 'Value proposition', 'yellow', ['What do you give your customer?', 'Why them, and not someone else?']),
    ...cell('relationships', 3, TITLE_SPACE, short, 'Customer relationships', 'mint', ['How do they hear from you?']),
    ...cell('channels', 3, TITLE_SPACE + short + 80, short, 'Channels', 'mint', ['How does it get to them?']),
    ...cell('segments', 4, TITLE_SPACE, tall, 'Customer segments', 'lilac', ['Who is it for?', 'Who is it not for?']),
    frame('costs', 0, row2, 1220, short, 'Cost structure', 'peach'),
    slot('costs-0', 140, row2 + 60, 'What costs you the most?', 'peach'),
    slot('costs-1', 440, row2 + 60, 'What costs you every month?', 'peach'),
    frame('revenue', 1260, row2, 1200, short, 'Revenue streams', 'mint'),
    slot('revenue-0', 1400, row2 + 60, 'What do they pay for?', 'mint'),
    slot('revenue-1', 1700, row2 + 60, 'How often do they pay?', 'mint'),
  ]
}

export const TEMPLATES: TemplateDef[] = [
  define('brain_dump', 'Brain dump', 'Tip out every idea, however rough, before judging any.', brainDump()),
  define('customer_problem', 'Customer and problem', 'Who it is for, what goes wrong for them, and how they cope.', customerProblem()),
  define('offer_comparison', 'Offer comparison', 'Three offers side by side, and the limits they must fit.', offerComparison()),
  define('name_ideas', 'Name ideas', 'Every name that comes to mind, then a shortlist.', nameIdeas()),
  define('pros_cons', 'Pros and cons', 'A decision, with the case for and against it.', prosCons()),
  define('assumptions', 'Assumptions to test', 'What you are taking for granted, and a cheap way to check each.', assumptions()),
  define('business_model', 'Business model canvas', 'The nine boxes of a business model, each with a place to start.', businessModel()),
]

export const templateById = (id: string): TemplateDef | undefined => TEMPLATES.find((template) => template.id === id)

// ---- Putting one on the board ----

// A group is the name for one use of a template: the template and a number of its own, so that everything one use put on the board can be found, and
// the template it came from is known.
export const groupFor = (templateId: TemplateId, instance: string) => `${templateId}:${instance}`
export const templateOfGroup = (group: string): TemplateDef | undefined => templateById(group.split(':')[0])

// A template as things for the board: moved to where it goes (kept inside the board), each thing with a new id of its own and the group, and
// every arrow on the new ids. `newId` is given so that this stays a pure function.
export function instantiateTemplate(template: TemplateDef, origin: Point, newId: () => string, group: string): BoardItem[] {
  const at = keepInside({ x: origin.x, y: origin.y, ...template.size })
  const ids = new Map(template.items.map((item) => [item.id, newId()]))
  const end = (e: ConnectorItem['from']): ConnectorItem['from'] => ('item' in e ? { item: ids.get(e.item)! } : { x: e.x + at.x, y: e.y + at.y })
  return template.items.map((item) => {
    const id = ids.get(item.id)!
    if (isConnector(item)) return { ...item, id, from: end(item.from), to: end(item.to), group }
    return { ...item, id, x: item.x + at.x, y: item.y + at.y, group }
  })
}

// Where a template goes: the nearest clear place to a point, with room round it. If there is none, it goes over what is there, near the point,
// and `clear` says so.
export function placeTemplate(template: TemplateDef, existing: BoardItem[], near: Point): { origin: Point; clear: boolean } {
  const { rect, clear } = freeAreaNear(template.size, existing.filter(isRectItem).map(rectOf), near, MARGIN)
  return { origin: { x: rect.x, y: rect.y }, clear }
}

// Where a template that is already on the board began, from what is left of it: its top-left corner, so that it can be put back there.
export function originOfGroup(items: BoardItem[], group: string): Point | null {
  const mine = items.filter(isRectItem).filter((item) => item.group === group)
  const box = boundsOf(mine.map(rectOf))
  return box ? { x: box.x, y: box.y - TITLE_SPACE } : null
}

// The things on the board that one use of a template put there.
export const itemsInGroup = (items: BoardItem[], group: string) => items.filter((item) => item.group === group)

// The prompts of a template that can be filled in: its empty notes, in the order they are drawn in. (A shape with a hint is a question for the founder
// to answer in their own words, so it is not one of these.) The AI is given this order, and writes its words for the prompts in it.
export const promptsOf = (template: TemplateDef): NoteItem[] => template.items.filter((item): item is NoteItem => item.kind === 'note' && !!item.hint)

export const framesOf = (template: TemplateDef) => template.items.filter(isFrame)
