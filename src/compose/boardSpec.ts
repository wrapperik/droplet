import { screenActionSchemas, type ScreenAction } from './screenActions.ts'
import { z } from 'zod'
import { SHAPE_KINDS, SHAPE_COLOURS, NOTE_COLOURS, TEXT_SIZES, CONNECTOR_STYLES, CONNECTOR_HEADS } from '../lib/boardTypes.ts'
import { TEMPLATE_IDS } from '../lib/boardTemplates.ts'
import { blocksField, messageField, opensField, proposeField, questionField, repliesField, titleField } from './conversationFields.ts'
import { TASKS } from './taskNames.ts'

// What the composer may do on the business-idea board, and what it is told about it. The same rules as for the palette and the invoice: the
// actions are things a person can do on the board, they go through the same reducer, and the composer never saves.
//
// Things kept out of its hands on purpose:
// - It never chooses where anything goes, how big it is or what colour it is. It says what to add and where it belongs (in a frame, near a note,
//   or just on the board), and the app finds the place, draws it pink, and puts "Droplet" on it, so the founder can tell whose it is.
// - What it may do to the founder's things is limited. It may move and tidy them (always shown in the receipt, with Undo this), but it cannot delete or
//   rewrite them without a yes in the chat, and it may recolour them only when the founder's own words ask for a colour. Its own notes it may change freely.
// - It acts only when asked. Nothing in the app asks it in the background.
// - It is sent the board only when the founder sends a message, and it cannot save.

const text = (max: number) => z.string().trim().min(1).max(max)

// The most a note by Droplet says. A note is a sticky note, not a paragraph.
export const AI_NOTE_TEXT = 140
// The most it writes into the prompt of a template, which is a smaller note.
export const AI_PROMPT_TEXT = 100
// The most in one reply.
export const MAX_BOARD_ACTIONS = 24
export const MAX_AI_NOTES = 12
export const MAX_AI_CLUSTERS = 4
export const MAX_AI_ARROWS = 12
// The most it moves, tidies or arranges in one reply, and the most it asks to delete or change at once.
export const MAX_AI_MOVES = 20
export const MAX_AI_REMOVALS = 30
export const MAX_AI_SUMMARY_LINES = 9
// The colours it may give a thing, which are the founder's own: never pink, which is Droplet's.
export const AI_COLOURS = SHAPE_COLOURS

// A thing on the board, by the short name it is given in the board the model is shown: f for a frame, n for a note, s for a shape, t for text
// and a for an arrow, counting from 1 in the order shown.
export const refSchema = z
  .string()
  .regex(/^[fnstac]\d{1,3}$/, 'must be a reference from the board, such as n3 or f1')
  .describe('A thing on the board, by the reference shown in <board>, such as n3 (a note) or f1 (a frame).')

export const boardActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.enum(['add_note']),
    text: text(AI_NOTE_TEXT).describe(`The words of one new sticky note: one idea, in a short phrase or a sentence, up to ${AI_NOTE_TEXT} characters.`),
    in: refSchema.optional().describe('A frame (f1, f2...) to put it in. The app finds a clear place inside it.'),
    near: refSchema.optional().describe('A thing to put it next to, such as the note it grows from. Give in or near, not both. With neither it goes near what the founder is looking at.'),
    connect: z.boolean().optional().describe('True to draw an arrow from the thing named in near to the new note. Only with near.'),
  }),
  z.object({
    type: z.enum(['fill_prompt']),
    note: refSchema.describe('An empty prompt note, listed in emptyPrompts. It becomes a note by Droplet in the same place.'),
    text: text(AI_PROMPT_TEXT).describe(`The words to write in it, up to ${AI_PROMPT_TEXT} characters, in answer to its hint.`),
  }),
  z.object({
    type: z.enum(['cluster']),
    title: text(60).describe('The title of the group, two to five words.'),
    notes: z.array(refSchema).min(2).max(20).describe('The things that belong together, which are moved into a new frame with this title. Each thing in one group only.'),
  }),
  z.object({
    type: z.enum(['add_template']),
    template: z.enum(TEMPLATE_IDS).describe('A template to put on the board.'),
    fill: z
      .array(text(AI_PROMPT_TEXT))
      .max(20)
      .optional()
      .describe('Words for its prompts, in the order they are listed for that template, each up to 100 characters. Leave out to put the empty template on the board for the founder to fill in.'),
  }),
  z.object({
    type: z.enum(['connect']),
    from: refSchema,
    to: refSchema,
    label: z.string().trim().max(60).optional().describe('A few words on the arrow, such as "leads to".'),
  }),
  z.object({
    type: z.enum(['move_to_frame']),
    things: z.array(refSchema).min(1).max(MAX_AI_MOVES).describe('Notes, shapes or text to move into the frame. The app finds a clear place for each inside it.'),
    frame: refSchema.describe('The frame (f1, f2...) they go into.'),
  }),
  z.object({
    type: z.enum(['tidy']),
    frame: refSchema.optional().describe('One frame whose contents are laid out in a neat grid, and the frame fitted round them. Leave out to tidy every frame that holds two or more things.'),
  }),
  z.object({
    type: z.enum(['arrange']),
    layout: z.enum(['row', 'column', 'grid']).describe('How to lay the frames out, with even gaps. What is inside each frame moves with it.'),
    frames: z.array(refSchema).min(2).max(12).describe('The frames to lay out, in the order they should come.'),
  }),
  z.object({
    type: z.enum(['remove']),
    things: z.array(refSchema).min(1).max(MAX_AI_REMOVALS).describe('Things to delete. Your own notes go at once. The founder\'s own are not deleted: the app asks them in the chat first, and only a yes deletes them.'),
  }),
  z.object({
    type: z.enum(['edit_note']),
    note: refSchema.describe('A note, shape or text with words in it.'),
    text: text(300).describe('The new words. On one of your own notes it is changed at once. On one of the founder\'s it is only a suggestion, shown in the chat with Accept and Dismiss.'),
  }),
  z.object({
    type: z.enum(['rename_frame']),
    frame: refSchema,
    title: text(60).describe('The new title. Shown to the founder as a suggestion in the chat, with Accept and Dismiss.'),
  }),
  z.object({
    type: z.enum(['colour']),
    things: z.array(refSchema).min(1).max(MAX_AI_MOVES).describe('Notes, shapes or frames to recolour.'),
    colour: z.enum(AI_COLOURS).describe('A founder colour. Never pink. A note cannot be white.'),
    quote: z.string().trim().min(1).max(200).describe('The founder\'s own words from <request> or <conversation> that ask for this colour, copied exactly. If they did not ask for a colour, do not recolour anything.'),
  }),
  z.object({
    type: z.enum(['summary_frame']),
    decided: z.array(text(100)).max(4).describe('What the board has settled, one short line each. Only what the notes really show is decided.'),
    open: z.array(text(100)).max(4).describe('What is still unanswered.'),
    next: z.array(text(100)).max(3).describe('Small, concrete next steps.'),
  }),
  z.object({ type: z.enum(['undo']) }),
  z.object({ type: z.enum(['redo']) }),
  ...screenActionSchemas,
])

export type BoardTurnAction = Exclude<z.infer<typeof boardActionSchema>, ScreenAction>

export const boardTurnSchema = z.object({
  task: z.enum(TASKS).describe('The task the request belongs to, or chat for ordinary conversation.'),
  message: messageField,
  question: questionField,
  replies: repliesField,
  blocks: blocksField,
  actions: z.array(boardActionSchema).max(MAX_BOARD_ACTIONS).describe('What to do on the board. Empty when the founder only wants an answer.'),
  // After the actions, so the model has decided what it is doing before it says whether that opens a workspace.
  opens: opensField,
  propose: proposeField,
  memoryUsed: z.array(z.string().max(60)).max(6).describe('Which saved decisions you used, by key.'),
  title: titleField,
})

export type BoardTurn = z.infer<typeof boardTurnSchema>

// ---- What it is shown ----

const rectFields = { x: z.number().finite().min(0).max(4800), y: z.number().finite().min(0).max(3200), w: z.number().finite().min(1).max(4800), h: z.number().finite().min(1).max(3200) }
const words = z.string().max(160)

// One thing on the board, as the model is shown it: what it is, what it says, and where it is (the app uses the place to put new things clear
// of it; the model is not asked to use it).
const itemSnapshot = z.discriminatedUnion('kind', [
  z.object({ ref: refSchema, kind: z.literal('note'), ...rectFields, text: words, colour: z.enum(NOTE_COLOURS), author: z.enum(['you', 'ai']), hint: z.string().max(120).optional(), template: z.enum(TEMPLATE_IDS).optional() }),
  z.object({ ref: refSchema, kind: z.literal('shape'), ...rectFields, shape: z.enum(SHAPE_KINDS), text: words, colour: z.enum(SHAPE_COLOURS), hint: z.string().max(120).optional(), template: z.enum(TEMPLATE_IDS).optional() }),
  z.object({ ref: refSchema, kind: z.literal('text'), ...rectFields, size: z.enum(TEXT_SIZES), text: words, hint: z.string().max(120).optional(), template: z.enum(TEMPLATE_IDS).optional() }),
  z.object({ ref: refSchema, kind: z.literal('frame'), ...rectFields, title: words, colour: z.enum(SHAPE_COLOURS), template: z.enum(TEMPLATE_IDS).optional() }),
  z.object({
    ref: refSchema,
    kind: z.literal('connector'),
    // The references of the things it joins, or null for an end on nothing, or on something not shown.
    from: refSchema.nullable(),
    to: refSchema.nullable(),
    style: z.enum(CONNECTOR_STYLES),
    head: z.enum(CONNECTOR_HEADS),
    text: z.string().max(60),
    template: z.enum(TEMPLATE_IDS).optional(),
  }),
])

export const MAX_SNAPSHOT_ITEMS = 120

export const boardSnapshotSchema = z.object({
  items: z.array(itemSnapshot).max(MAX_SNAPSHOT_ITEMS),
  // How many more things are on the board that are not shown here.
  more: z.number().int().min(0).max(1000),
  // The middle of what the founder is looking at, where things with no place of their own go.
  view: z.object({ x: z.number().finite().min(0).max(4800), y: z.number().finite().min(0).max(3200) }),
  // What is selected, by reference.
  selection: z.array(refSchema).max(MAX_SNAPSHOT_ITEMS),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
  saved: z.enum(['none', 'saved', 'unsaved']),
})
export type BoardSnapshot = z.infer<typeof boardSnapshotSchema>
export type BoardItemSnapshot = z.infer<typeof itemSnapshot>
