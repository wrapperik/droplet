import { z } from 'zod'

// Actions on the screen rather than on a workspace: go back to one that is already open, or close the workspaces and return to the full chat. They
// fit every workspace, like undo and redo, and every turn schema carries them. They are applied by Home after the workspace's own actions. A
// workspace that is not open is never opened by an action: that is `opens`, which needs the founder's own words (see conversationFields.ts).

export const SCREEN_WORKSPACES = ['brand', 'invoice', 'board'] as const
export type ScreenWorkspace = (typeof SCREEN_WORKSPACES)[number]

export const screenActionSchemas = [
  z.object({
    type: z.enum(['switch_to']),
    workspace: z.enum(SCREEN_WORKSPACES).describe('A workspace that is already open, listed in <open_workspaces>, and not the one on screen: brand (the palette), invoice or board (the business idea board).'),
  }),
  z.object({ type: z.enum(['close_workspace']) }),
] as const

export type ScreenAction = z.infer<(typeof screenActionSchemas)[number]>

export const SCREEN_ACTION_TYPES: string[] = ['switch_to', 'close_workspace']
export const isScreenAction = (action: { type: string }): action is ScreenAction => SCREEN_ACTION_TYPES.includes(action.type)

// What a workspace is called to the founder.
export const WORKSPACE_NAMES: Record<ScreenWorkspace, string> = { brand: 'brand workspace', invoice: 'invoice workspace', board: 'business idea board' }
