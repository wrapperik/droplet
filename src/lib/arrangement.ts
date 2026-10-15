import { COLS, clamp, samePlacements, type Placement } from './gridLayout.ts'

// How a workspace is arranged, which is the same for every task: tools in the toolbar under the header, windows on the
// grid, tools that have been dragged out into windows, and what has been hidden. A task describes its components in a spec
// (the palette has a canvas and a colour picker, the invoice has a document and a client), and everything here works from
// that spec. The palette and the invoice both keep this in their own state and hand its actions to `reduceArrangement`.

// A window can be dragged to any width on the grid, from this many columns (out of 24) to the full width.
export const PANEL_MIN_COLS = 6
export const clampPanelWidth = (columns: number) => clamp(Math.round(columns), PANEL_MIN_COLS, COLS)

// A tool sits in the toolbar in one compact form. Dragged down out of the toolbar it becomes its own bigger window on the
// grid, and dragged back it returns. A panel is a window that is never in the toolbar.
export type ComponentKind = 'toolbar' | 'panel'
export type ComponentDef = { id: string; label: string; kind: ComponentKind; hideable: boolean }
// How big a window starts, in columns, and roughly how tall it is in pixels (for the outline shown while a tool is dragged
// out, before the window exists to be measured).
export type WindowSize = { w: number; heightPx: number }

export type ArrangementSpec = {
  components: ComponentDef[]
  // Where every window starts, including the windows that tools become. Rows are only a preference.
  layout: Placement[]
  windowSizes: Record<string, WindowSize>
  // Components that are off the screen until the founder (or the AI) brings them, when nothing has been saved.
  defaultHidden?: string[]
}

export type Arrangement = {
  // Where each window sits on the grid.
  layout: Placement[]
  // Every tool, in the order they sit in the toolbar. A hidden tool keeps its place in the order.
  tools: string[]
  // Tools that are dragged out of the toolbar and are windows on the grid for now.
  expanded: string[]
  // Components the founder (or the AI) has taken off the screen.
  hidden: string[]
  // One line on why a component is on screen, where the composer gave one.
  reasons: Record<string, string>
}

// What a save keeps of the arrangement. Everything is optional, so older saves still load. None of it is read back any more:
// a workspace always opens with the spec's defaults (see `openArrangement`).
export type ArrangementSave = { layout?: Placement[]; tools?: string[]; expanded?: string[]; hidden?: string[] }

export type ArrangementAction =
  | { type: 'layout'; layout: Placement[] }
  // A window's width in columns.
  | { type: 'resize'; id: string; value: number }
  // A tool becomes a window on the grid, in the given layout if one is sent. A window goes back to the toolbar, before
  // another tool or at the end when `before` is null, or where it was when `before` is left out.
  | { type: 'expand_tool'; id: string; layout?: Placement[] }
  | { type: 'collapse_tool'; id: string; before?: string | null }
  // Puts a tool in the toolbar before another, or at the end when `before` is null.
  | { type: 'move_tool'; id: string; before: string | null }
  | { type: 'show'; component: string; reason?: string }
  | { type: 'hide'; component: string }
  | { type: 'reset_layout' }

const ARRANGEMENT_TYPES = ['layout', 'resize', 'expand_tool', 'collapse_tool', 'move_tool', 'show', 'hide', 'reset_layout']
export const isArrangementAction = (action: { type: string }): action is ArrangementAction => ARRANGEMENT_TYPES.includes(action.type)

export const kindOf = (spec: ArrangementSpec, id: string) => spec.components.find((c) => c.id === id)?.kind
export const toolIds = (spec: ArrangementSpec) => spec.components.filter((c) => c.kind === 'toolbar').map((c) => c.id)
export const panelIds = (spec: ArrangementSpec) => spec.components.filter((c) => c.kind === 'panel').map((c) => c.id)

// A layout of the visible items put back into the full layout, which also remembers where hidden items belong.
export const mergeLayout = (all: Placement[], visible: Placement[]): Placement[] => [
  ...visible,
  ...all.filter((placement) => !visible.some((v) => v.id === placement.id)),
]

// A saved or sent order made complete: tools it does not know are dropped, and tools it lacks are added in the default order.
export const normaliseTools = (spec: ArrangementSpec, order: string[] | undefined): string[] => {
  const tools = toolIds(spec)
  const known = (order ?? []).filter((id, index, all) => tools.includes(id) && all.indexOf(id) === index)
  return [...known, ...tools.filter((id) => !known.includes(id))]
}

// Which tools are windows rather than in the toolbar: known, once each, in the order given.
export const normaliseExpanded = (spec: ArrangementSpec, ids: string[] | undefined): string[] =>
  (ids ?? []).filter((id, index, all) => toolIds(spec).includes(id) && all.indexOf(id) === index)

// The arrangement a workspace opens in: always where things start. A save may still hold a layout, a tool order, tools that were
// pulled out and parts that were hidden, from before the workspace became a fixed frame, and none of that is applied: an old
// `hidden` must not take a part off the screen for good. The argument is kept so callers need not change.
export function openArrangement(spec: ArrangementSpec, _saved?: ArrangementSave | null): Arrangement {
  return {
    layout: spec.layout,
    tools: toolIds(spec),
    expanded: [],
    hidden: spec.defaultHidden ?? [],
    reasons: {},
  }
}

export const isVisible = (a: Pick<Arrangement, 'hidden'>, id: string) => !a.hidden.includes(id)
export const isExpanded = (a: Pick<Arrangement, 'expanded'>, id: string) => a.expanded.includes(id)
// The tools that are in the toolbar, left to right.
export const toolbarTools = (a: Arrangement) => a.tools.filter((id) => isVisible(a, id) && !isExpanded(a, id))
// What is a window on the grid: the panels, and the tools that have been dragged out of the toolbar.
export const isWindow = (spec: ArrangementSpec, a: Arrangement, id: string) => kindOf(spec, id) === 'panel' || isExpanded(a, id)
export const shownWindows = (spec: ArrangementSpec, a: Arrangement) =>
  spec.components.map((c) => c.id).filter((id) => isVisible(a, id) && isWindow(spec, a, id))

// Whether everything is where it starts: the same windows in the same places, and the tools in the toolbar in order.
export function arrangementIsDefault(spec: ArrangementSpec, a: Arrangement): boolean {
  const shown = shownWindows(spec, a)
  const only = (placements: Placement[]) => placements.filter((p) => shown.includes(p.id))
  return samePlacements(only(a.layout), only(spec.layout)) && a.tools.join() === toolIds(spec).join() && a.expanded.length === 0
}

// Whether the arrangement counts as an unsaved change. It does not: a saved arrangement is no longer applied when a workspace opens, so
// moving, pulling out or hiding something is never work that Save would keep. The function stays until the callers are trimmed.
export function arrangementUnsaved(_spec: ArrangementSpec, _a: Arrangement, _saved: ArrangementSave): boolean {
  return false
}

// The state after an action, or the very same object if the action changes nothing.
export function reduceArrangement<T extends Arrangement>(spec: ArrangementSpec, doc: T, action: ArrangementAction): T {
  switch (action.type) {
    case 'layout':
      return { ...doc, layout: action.layout }

    // Only a window has a width. A tool in the toolbar has one size.
    case 'resize': {
      if (!isWindow(spec, doc, action.id)) return doc
      const width = clampPanelWidth(action.value)
      return { ...doc, layout: doc.layout.map((p) => (p.id === action.id ? { ...p, w: width } : p)) }
    }

    case 'expand_tool': {
      if (!toolIds(spec).includes(action.id) || isExpanded(doc, action.id)) return doc
      return { ...doc, expanded: [...doc.expanded, action.id], layout: action.layout ?? doc.layout }
    }

    case 'collapse_tool': {
      if (!isExpanded(doc, action.id)) return doc
      const back = { ...doc, expanded: doc.expanded.filter((id) => id !== action.id) }
      return action.before === undefined ? back : reduceArrangement(spec, back, { type: 'move_tool', id: action.id, before: action.before })
    }

    case 'move_tool': {
      const { tools } = doc
      if (!tools.includes(action.id) || action.id === action.before || (action.before !== null && !tools.includes(action.before))) return doc
      const rest = tools.filter((id) => id !== action.id)
      const at = action.before === null ? rest.length : rest.indexOf(action.before)
      const next = [...rest.slice(0, at), action.id, ...rest.slice(at)]
      return next.join() === tools.join() ? doc : { ...doc, tools: next }
    }

    case 'show': {
      const reasons = action.reason ? { ...doc.reasons, [action.component]: action.reason } : doc.reasons
      if (!doc.hidden.includes(action.component) && reasons === doc.reasons) return doc
      return { ...doc, hidden: doc.hidden.filter((id) => id !== action.component), reasons }
    }

    case 'hide': {
      const component = spec.components.find((c) => c.id === action.component)
      if (!component?.hideable || doc.hidden.includes(action.component)) return doc
      return { ...doc, hidden: [...doc.hidden, action.component] }
    }

    case 'reset_layout':
      return { ...doc, layout: spec.layout, tools: toolIds(spec), expanded: [] }
  }
}
