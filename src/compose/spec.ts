import { z } from 'zod'

// The output contract: what the model may return, and the only thing the app will act on. Defined once, here, so the
// JSON schema sent to the model and the checks the app runs cannot drift apart.
//
// A turn is a message to the founder (an answer, advice, or what was done) plus actions. The actions are the same
// ones a person has on the interface, nothing more, and they are applied through the same reducer. The model chooses
// and fills the interface. It never draws it, and it never saves: only the founder's Save commits to memory.

export const TASKS = ['ideation', 'brand', 'logo', 'invoice', 'correspondence', 'chat'] as const
export type Task = (typeof TASKS)[number]

export const COLOUR_ROLES = ['primary', 'accent', 'background', 'text'] as const
export const HARMONIES = ['analogous', 'complementary', 'triad', 'monochrome'] as const
// Components the model can name. The canvas is the palette itself, so it can be moved and resized but not hidden.
export const ALL_COMPONENTS = ['picker', 'role', 'generate', 'canvas', 'preview'] as const
export const HIDEABLE_COMPONENTS = ['picker', 'role', 'generate', 'preview'] as const

const sentence = (max: number) => z.string().trim().min(1).max(max)

const hex = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'must be a six digit hex colour such as #1F8FE0')
  .describe('A six digit hex colour with a leading #, such as #1F8FE0.')

const index = z
  .number()
  .int()
  .min(1)
  .max(8)
  .describe('The colour\'s number in the current palette, counting from 1 in the order shown.')

export const paletteColourSchema = z.object({
  hex,
  name: sentence(30).describe('A short plain name for the colour, up to three words, such as "Warm clay".'),
  rationale: sentence(160).describe('One plain sentence on why this colour suits this business. No jargon.'),
  role: z
    .enum(COLOUR_ROLES)
    .optional()
    .describe('What the colour is for. Give each role to at most one colour. Leave it out if unsure.'),
})

const optionalName = sentence(30).optional().describe('A short plain name for the colour.')
const optionalRationale = sentence(160).optional().describe('One plain sentence on why this colour suits the business.')

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.enum(['set_palette']),
    colours: z.array(paletteColourSchema).min(3).max(8).describe('Three to eight colours that work together. Replaces the whole palette.'),
    reason: sentence(140).describe('One line saying why the palette is on screen.'),
    businessName: z.string().trim().max(40).optional().describe('The business name, if the request gives one.'),
  }),
  z.object({ type: z.enum(['set_colour']), index, hex, name: optionalName, rationale: optionalRationale }),
  z.object({ type: z.enum(['add_colour']), hex, name: optionalName, rationale: optionalRationale, role: z.enum(COLOUR_ROLES).optional() }),
  z.object({ type: z.enum(['remove_colour']), index }),
  z.object({ type: z.enum(['set_role']), index, role: z.enum([...COLOUR_ROLES, 'none']).describe('A role, or "none" to clear it.') }),
  z.object({ type: z.enum(['keep_colour']), index, keep: z.boolean().describe('True to keep the colour when Generate fills in the others.') }),
  z.object({ type: z.enum(['select_colour']), index }),
  z.object({
    type: z.enum(['generate']),
    harmony: z.enum(HARMONIES),
    from: index.optional().describe('The colour to start from. The selected colour if left out.'),
  }),
  z.object({
    type: z.enum(['show_component']),
    component: z.enum(HIDEABLE_COMPONENTS),
    reason: sentence(140).optional().describe('One line saying why this component is on screen.'),
  }),
  z.object({ type: z.enum(['hide_component']), component: z.enum(HIDEABLE_COMPONENTS) }),
  z.object({
    type: z.enum(['move_component']),
    component: z.enum(ALL_COMPONENTS),
    relativeTo: z.enum(ALL_COMPONENTS),
    placement: z.enum(['above', 'below', 'left_of', 'right_of']).describe('Where to put the component, relative to the other one.'),
  }),
  z.object({
    type: z.enum(['resize_component']),
    component: z.enum(ALL_COMPONENTS),
    size: z
      .enum(['compact', 'large', 'third', 'half', 'two_thirds', 'full'])
      .describe('Toolbars (picker, role, generate) are compact or large. Panels (canvas, preview) are third, half, two_thirds or full.'),
  }),
  z.object({ type: z.enum(['reset_layout']) }),
  z.object({ type: z.enum(['export_brand_sheet']) }),
  z.object({ type: z.enum(['undo']) }),
  z.object({ type: z.enum(['redo']) }),
])

export type TurnAction = z.infer<typeof actionSchema>
export type PaletteColour = z.infer<typeof paletteColourSchema>

export const MAX_ACTIONS = 12

export const turnSchema = z.object({
  task: z.enum(TASKS).describe('The task the request belongs to, or chat for ordinary conversation.'),
  message: sentence(700).describe('What you say to the founder: an answer, advice, or what you did and why. First person, plain.'),
  actions: z.array(actionSchema).max(MAX_ACTIONS).describe('What to do on the workspace. Empty when the founder only wants an answer.'),
  memoryUsed: z.array(z.string().max(60)).max(6).describe('Which saved decisions you used, by key, such as brand.palette.'),
})

export type Turn = z.infer<typeof turnSchema>

const placementSchema = z.object({
  id: z.string().max(20),
  col: z.number().int().min(-1).max(23),
  row: z.number().int().min(0),
  w: z.number().int().min(1).max(24),
})

// The live state of the workspace, sent with every request so the model knows what the founder is looking at.
export const workspaceSnapshotSchema = z.object({
  blocks: z
    .array(
      z.object({
        id: z.number().int(),
        hex,
        role: z.enum(COLOUR_ROLES).optional(),
        locked: z.boolean().optional(),
        name: z.string().max(60).optional(),
      }),
    )
    .min(2)
    .max(8),
  selectedId: z.number().int(),
  harmony: z.enum(HARMONIES),
  hidden: z.array(z.string().max(20)).max(10),
  sizes: z.record(z.string().max(20), z.number().int().min(0).max(3)),
  // Where each visible component is drawn now.
  layout: z.array(placementSchema).max(10),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
  saved: z.enum(['none', 'saved', 'unsaved']),
})
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>

// The palette the founder has saved to this project.
export const paletteSnapshotSchema = z.object({
  colours: z
    .array(z.object({ hex, role: z.enum(COLOUR_ROLES).optional() }))
    .min(1)
    .max(8),
})
export type PaletteSnapshot = z.infer<typeof paletteSnapshotSchema>

export const MAX_HISTORY_MESSAGES = 10

export const composeRequestSchema = z.object({
  intent: z.string().trim().min(1).max(600),
  // The conversation so far, oldest first, so a follow-up such as "make it warmer" makes sense.
  history: z
    .array(z.object({ role: z.enum(['founder', 'droplet']), text: z.string().trim().min(1).max(800) }))
    .max(MAX_HISTORY_MESSAGES)
    .optional(),
  // Absent when no workspace is open yet.
  workspace: workspaceSnapshotSchema.optional(),
  memory: paletteSnapshotSchema.optional(),
})
export type ComposeRequest = z.infer<typeof composeRequestSchema>

export const OUTCOMES = ['valid', 'retried', 'fallback'] as const
export type Outcome = (typeof OUTCOMES)[number]

export const composeResponseSchema = z.object({
  outcome: z.enum(OUTCOMES),
  turn: turnSchema,
  // Set when a simpler view was used, so the interface can say so.
  note: z.string().max(200).optional(),
})
export type ComposeResponse = z.infer<typeof composeResponseSchema>

// Keywords the model's schema support is unsure about, or refuses, are left out. They are checked after the reply instead, by
// the same Zod schema. oneOf becomes anyOf, which is the form the API documents.
// Array length limits are left out too: with this many action types the API refuses a schema that carries them
// (tested against gemini-3.8-flash), so the counts are in the field descriptions and checked by Zod afterwards.
const DROPPED_KEYWORDS = new Set(['$schema', 'pattern', 'minLength', 'maxLength', 'format', 'default', 'minItems', 'maxItems'])

function simplify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(simplify)
  if (node === null || typeof node !== 'object') return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (DROPPED_KEYWORDS.has(key)) continue
    out[key === 'oneOf' ? 'anyOf' : key] = simplify(value)
  }
  return out
}

// The JSON schema for the model's reply, generated from the Zod contract above.
export function turnJsonSchema(): Record<string, unknown> {
  return simplify(z.toJSONSchema(turnSchema)) as Record<string, unknown>
}
