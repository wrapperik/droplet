import { z } from 'zod'
import { BOARD_H, BOARD_W } from './boardGeometry.ts'
import { CONNECTOR_HEADS, CONNECTOR_STYLES, MAX_GROUP, MAX_HINT, MAX_ITEMS, MAX_LABEL, MAX_NOTE_TEXT, MAX_TEXT, MAX_TITLE, NOTE_COLOURS, SHAPE_COLOURS, SHAPE_KINDS, SIZE_LIMITS, TEXT_SIZES } from './boardTypes.ts'

// What a saved board looks like. Everything read back is validated, because storage can hold anything. A save from before shapes, text, frames
// and arrows existed holds only notes, and is still read.
const placementSchema = z.object({
  id: z.string(),
  col: z.number().int().min(-1).max(23),
  row: z.number().int().min(0),
  w: z.number().int().min(1).max(24),
})

const id = z.string().min(1).max(80)
// Which use of a template put a thing there, and the faint prompt it shows while it is empty. Neither is required.
const extras = { group: z.string().max(MAX_GROUP).optional(), starred: z.boolean().optional() }
const hinted = { ...extras, hint: z.string().max(MAX_HINT).optional() }

// A rectangle on the board: its place inside the board, and its size up to the most that kind can be.
const rect = (kind: keyof typeof SIZE_LIMITS) => ({
  x: z.number().finite().min(0).max(BOARD_W),
  y: z.number().finite().min(0).max(BOARD_H),
  w: z.number().finite().min(1).max(SIZE_LIMITS[kind].max.w),
  h: z.number().finite().min(1).max(SIZE_LIMITS[kind].max.h),
})

const noteSchema = z.object({
  id,
  kind: z.literal('note'),
  ...hinted,
  ...rect('note'),
  text: z.string().max(MAX_NOTE_TEXT),
  colour: z.enum(NOTE_COLOURS),
  author: z.enum(['you', 'ai']),
})

const shapeSchema = z.object({
  id,
  kind: z.literal('shape'),
  ...hinted,
  ...rect('shape'),
  shape: z.enum(SHAPE_KINDS),
  text: z.string().max(MAX_TEXT),
  colour: z.enum(SHAPE_COLOURS),
})

const textSchema = z.object({ id, kind: z.literal('text'), ...hinted, ...rect('text'), text: z.string().max(MAX_TEXT), size: z.enum(TEXT_SIZES) })

const frameSchema = z.object({ id, kind: z.literal('frame'), ...extras, ...rect('frame'), title: z.string().max(MAX_TITLE), colour: z.enum(SHAPE_COLOURS) })

const endSchema = z.union([
  z.object({ item: id }),
  z.object({ x: z.number().finite().min(0).max(BOARD_W), y: z.number().finite().min(0).max(BOARD_H) }),
])

const connectorSchema = z.object({
  id,
  kind: z.literal('connector'),
  ...extras,
  from: endSchema,
  to: endSchema,
  style: z.enum(CONNECTOR_STYLES),
  head: z.enum(CONNECTOR_HEADS),
  text: z.string().max(MAX_LABEL),
})

export const boardSaveSchema = z.object({
  items: z.array(z.discriminatedUnion('kind', [noteSchema, shapeSchema, textSchema, frameSchema, connectorSchema])).max(MAX_ITEMS),
  layout: z.array(placementSchema),
  tools: z.array(z.string()).optional(),
  expanded: z.array(z.string()).optional(),
  hidden: z.array(z.string()).optional(),
  savedAt: z.string(),
  // When the saved board was last exported as a PNG or a PDF, if it has been.
  exportedAt: z.string().optional(),
})

export type BoardSave = z.infer<typeof boardSaveSchema>
