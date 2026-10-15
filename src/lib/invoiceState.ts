import {
  isArrangementAction,
  openArrangement,
  reduceArrangement,
  arrangementIsDefault,
  arrangementUnsaved,
  type Arrangement,
  type ArrangementAction,
  type ArrangementSave,
  type ArrangementSpec,
} from './arrangement.ts'
import type { Placement } from './gridLayout.ts'
import { newId } from './ids.ts'
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from './history.ts'
import {
  emptyLine,
  nextLineId,
  type Business,
  type Client,
  type InvoiceContent,
  type InvoiceDetails,
  type Line,
} from './invoice.ts'
import type { SavedInvoice } from './memorySave.ts'

// Everything about the invoice workspace that can change, and the one set of actions that changes it. As with the palette,
// the interface and (later) the AI both go through `reduce`, and one undo step covers a person's edit or a whole turn.

// The tools sit in the toolbar and become windows when dragged out. The document and the line items are always windows.
export const INVOICE_COMPONENTS: ArrangementSpec['components'] = [
  { id: 'invoices', label: 'Invoices', kind: 'toolbar', hideable: true },
  { id: 'business', label: 'Your business', kind: 'toolbar', hideable: true },
  { id: 'client', label: 'Client', kind: 'toolbar', hideable: true },
  { id: 'terms', label: 'Terms', kind: 'toolbar', hideable: true },
  { id: 'vat', label: 'VAT', kind: 'toolbar', hideable: true },
  { id: 'total', label: 'Total', kind: 'toolbar', hideable: true },
  { id: 'ready', label: 'Ready to export?', kind: 'toolbar', hideable: true },
  { id: 'document', label: 'Invoice', kind: 'panel', hideable: false },
  { id: 'lines', label: 'Line items', kind: 'panel', hideable: false },
]

export const INVOICE_WINDOW_SIZES: ArrangementSpec['windowSizes'] = {
  document: { w: 14, heightPx: 900 },
  lines: { w: 10, heightPx: 340 },
  invoices: { w: 8, heightPx: 420 },
  business: { w: 8, heightPx: 560 },
  client: { w: 8, heightPx: 460 },
  terms: { w: 8, heightPx: 420 },
  vat: { w: 8, heightPx: 320 },
  total: { w: 8, heightPx: 300 },
  ready: { w: 8, heightPx: 380 },
}

// The invoice document beside the line items. The tools also have a place on the grid, kept for when they are dragged out.
export const INVOICE_LAYOUT: Placement[] = [
  { id: 'document', col: 0, row: 0, w: INVOICE_WINDOW_SIZES.document.w },
  { id: 'lines', col: 14, row: 0, w: INVOICE_WINDOW_SIZES.lines.w },
  { id: 'invoices', col: 16, row: 120, w: INVOICE_WINDOW_SIZES.invoices.w },
  { id: 'business', col: 0, row: 60, w: INVOICE_WINDOW_SIZES.business.w },
  { id: 'client', col: 8, row: 60, w: INVOICE_WINDOW_SIZES.client.w },
  { id: 'terms', col: 16, row: 60, w: INVOICE_WINDOW_SIZES.terms.w },
  { id: 'vat', col: 0, row: 90, w: INVOICE_WINDOW_SIZES.vat.w },
  { id: 'total', col: 8, row: 90, w: INVOICE_WINDOW_SIZES.total.w },
  { id: 'ready', col: 16, row: 90, w: INVOICE_WINDOW_SIZES.ready.w },
]

export const INVOICE_SPEC: ArrangementSpec = { components: INVOICE_COMPONENTS, layout: INVOICE_LAYOUT, windowSizes: INVOICE_WINDOW_SIZES }

export type InvoiceDoc = Arrangement & {
  // Which invoice this is. It stays the same when the invoice is changed and confirmed again, and so does its number.
  invoiceId: string
  content: InvoiceContent
}

export type InvoiceState = { history: History<InvoiceDoc> }

type LinePatch = Partial<Omit<Line, 'id'>>

export type InvoiceAction =
  | { type: 'set_details'; patch: Partial<InvoiceDetails> }
  | { type: 'set_business'; patch: Partial<Business> }
  | { type: 'set_client'; patch: Partial<Client> }
  | { type: 'set_vat_registered'; value: boolean }
  // A new line at the end, with whatever is already known about it.
  | { type: 'add_line'; line?: LinePatch }
  | { type: 'update_line'; id: number; patch: LinePatch }
  // The last line left is cleared instead of removed, so there is always one to type in.
  | { type: 'remove_line'; id: number }
  | { type: 'move_line'; id: number; direction: 'up' | 'down' }
  | ArrangementAction
  | { type: 'undo' }
  | { type: 'redo' }
  // Several actions applied together and undone together.
  | { type: 'batch'; actions: InvoiceAction[] }

// A workspace for this invoice, arranged as the project's saved arrangement if there is one.
export function openInvoiceWorkspace(content: InvoiceContent, arrangement?: ArrangementSave | null, invoiceId: string = newId()): InvoiceState {
  return { history: createHistory({ invoiceId, content, ...openArrangement(INVOICE_SPEC, arrangement) }) }
}

export const invoiceDocOf = (state: InvoiceState): InvoiceDoc => state.history.present
export const canUndoInvoice = (state: InvoiceState) => canUndo(state.history)
export const canRedoInvoice = (state: InvoiceState) => canRedo(state.history)
export const invoiceArrangementIsDefault = (doc: InvoiceDoc) => arrangementIsDefault(INVOICE_SPEC, doc)

// Whether the invoice differs from what was confirmed (against its saved version, if it has one). How the workspace is arranged is not
// something that is kept, so it is never a difference (see `arrangementUnsaved`).
export function isInvoiceUnsaved(doc: InvoiceDoc, saved: SavedInvoice | undefined, arrangement: ArrangementSave | null): boolean {
  return !saved || JSON.stringify(doc.content) !== JSON.stringify(saved.content) || arrangementUnsaved(INVOICE_SPEC, doc, arrangement ?? {})
}

const withContent = (doc: InvoiceDoc, content: InvoiceContent): InvoiceDoc => ({ ...doc, content })

// Only the fields that really changed, so an edit that changes nothing is no step in the history.
function changed<T extends object>(current: T, patch: Partial<T>): T | null {
  const keys = Object.keys(patch) as (keyof T)[]
  if (keys.every((key) => patch[key] === undefined || current[key] === patch[key])) return null
  return { ...current, ...Object.fromEntries(keys.filter((key) => patch[key] !== undefined).map((key) => [key, patch[key]])) }
}

// A line patch with anything that cannot be a line value left out: a quantity must be a number, a price a whole number of cents.
function cleanLinePatch(patch: LinePatch): LinePatch {
  const clean: LinePatch = { ...patch }
  if (clean.quantity !== undefined && !Number.isFinite(clean.quantity)) delete clean.quantity
  if (clean.quantity !== undefined) clean.quantity = Math.round(clean.quantity * 100) / 100
  if (clean.unitCents !== undefined && clean.unitCents !== null && !Number.isSafeInteger(clean.unitCents)) delete clean.unitCents
  return clean
}

function step(doc: InvoiceDoc, action: InvoiceAction): InvoiceDoc {
  const { content } = doc
  switch (action.type) {
    case 'set_details': {
      const next = changed(content.details, action.patch)
      return next ? withContent(doc, { ...content, details: next }) : doc
    }
    case 'set_business': {
      const next = changed(content.business, action.patch)
      return next ? withContent(doc, { ...content, business: next }) : doc
    }
    case 'set_client': {
      const next = changed(content.client, action.patch)
      return next ? withContent(doc, { ...content, client: next }) : doc
    }
    case 'set_vat_registered':
      return content.vatRegistered === action.value ? doc : withContent(doc, { ...content, vatRegistered: action.value })

    case 'add_line': {
      const line: Line = { ...emptyLine(nextLineId(content.lines)), ...cleanLinePatch(action.line ?? {}) }
      return withContent(doc, { ...content, lines: [...content.lines, line] })
    }
    case 'update_line': {
      const current = content.lines.find((line) => line.id === action.id)
      if (!current) return doc
      const next = changed<Line>(current, cleanLinePatch(action.patch))
      return next ? withContent(doc, { ...content, lines: content.lines.map((line) => (line.id === action.id ? next : line)) }) : doc
    }
    case 'remove_line': {
      const current = content.lines.find((line) => line.id === action.id)
      if (!current) return doc
      if (content.lines.length === 1) {
        const blank = emptyLine(current.id)
        return JSON.stringify(blank) === JSON.stringify(current) ? doc : withContent(doc, { ...content, lines: [blank] })
      }
      return withContent(doc, { ...content, lines: content.lines.filter((line) => line.id !== action.id) })
    }
    case 'move_line': {
      const at = content.lines.findIndex((line) => line.id === action.id)
      const to = action.direction === 'up' ? at - 1 : at + 1
      if (at < 0 || to < 0 || to >= content.lines.length) return doc
      const lines = [...content.lines]
      ;[lines[at], lines[to]] = [lines[to], lines[at]]
      return withContent(doc, { ...content, lines })
    }

    case 'batch':
      return action.actions.reduce(step, doc)

    case 'undo':
    case 'redo':
      return doc

    default: {
      if (!isArrangementAction(action)) return doc
      return reduceArrangement(INVOICE_SPEC, doc, action)
    }
  }
}

// The quick edits that are one step: typing in one field, or in one field of one line.
function mergeKey(action: InvoiceAction): string | null {
  switch (action.type) {
    case 'set_details':
    case 'set_business':
    case 'set_client':
      return `${action.type}-${Object.keys(action.patch)[0]}`
    case 'update_line':
      return `line-${action.id}-${Object.keys(action.patch)[0]}`
    default:
      return null
  }
}

export function reduceInvoice(state: InvoiceState, action: InvoiceAction): InvoiceState {
  if (action.type === 'undo') return { history: undo(state.history) }
  if (action.type === 'redo') return { history: redo(state.history) }
  const next = step(state.history.present, action)
  const history = commit(state.history, next, mergeKey(action))
  return history === state.history ? state : { history }
}
