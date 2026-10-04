import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { InvoiceContent } from '../../lib/invoice.ts'
import { BillListIcon, BuildingsIcon, CalculatorIcon, CalendarIcon, CheckCircleIcon, SaleIcon, UserIcon } from '@solar-icons/react/linear'
import { toolbarTools } from '../../lib/arrangement.ts'
import { exportInvoice } from '../../lib/exportInvoice.ts'
import { checkInvoice, stepsDone, type Issue } from '../../lib/invoiceReadiness.ts'
import { resolveRoles } from '../../lib/palette.ts'
import { starterBlocks } from '../../compose/fallback.ts'
import { loadPalette } from '../../lib/projectStore.ts'
import { newId } from '../../lib/ids.ts'
import { duplicateInvoice, loadInvoice, openNewInvoice, openSavedInvoice, saveArrangement } from '../../lib/invoiceStore.ts'
import { loadMemory, saveMemory } from '../../lib/memoryStore.ts'
import type { ProjectMemory } from '../../lib/memorySave.ts'
import {
  businessStatus,
  clientStatus,
  forgetBusiness,
  forgetClient,
  forgetInvoice,
  markExported,
  numbersInUse,
  savedInvoice,
  withBusiness,
  withClient,
  withInvoice,
} from '../../lib/projectMemory.ts'
import {
  INVOICE_SPEC,
  INVOICE_WINDOW_SIZES,
  canRedoInvoice,
  canUndoInvoice,
  invoiceDocOf,
  isInvoiceUnsaved,
  type InvoiceAction,
  type InvoiceState,
} from '../../lib/invoiceState.ts'
import ExportButton from '../ExportButton.tsx'
import type { WorkspaceItem } from '../GridWorkspace.tsx'
import type { ShelfTool } from '../ToolShelf.tsx'
import WorkspaceShell, { type HeaderSlots } from '../WorkspaceShell.tsx'
import ConfirmSave, { type ConfirmItem } from './ConfirmSave.tsx'
import InvoiceDocument from './InvoiceDocument.tsx'
import { InvoicesWindow } from './InvoicesPanel.tsx'
import LeaveDialog from './LeaveDialog.tsx'
import { BusinessWindow, ClientWindow, DetailsWindow, TotalsWindow, VatWindow } from './InvoiceWindows.tsx'
import LineItemsEditor from './LineItemsEditor.tsx'
import { ReadyWindow } from './ReadyPanel.tsx'

type Props = {
  projectId: string
  projectName: string
  state: InvoiceState
  dispatch: (action: InvoiceAction) => void
  // Another invoice takes the workspace's place: a new one, or one that was saved.
  onReplace: (state: InvoiceState) => void
  // Asks for the note of what would be remembered to be opened (each change of the number is one ask), as the chat does when the
  // founder is about to leave. And told when the founder has confirmed.
  saveSignal?: number
  onConfirmed?: () => void
  headerSlots?: HeaderSlots
}

// What each tool is for, said once, shown as its tooltip and as its window's reason.
const REASONS = {
  invoices: 'Which invoice this is. An invoice keeps its number when you change it. Open it to see them all, or to start a new one.',
  business: 'Your business details are entered once and go on every invoice. Open it to add your address and bank details.',
  client: 'Who the invoice is for. Open it for their address, VAT number and reference.',
  terms: 'When payment is due. Open it for the invoice number, the date and a note.',
  vat: 'Whether you charge VAT. A business registered for VAT issues a tax invoice. Open it to see what changes.',
  total: 'What the invoice comes to, worked out in code from the lines. Open it to see the working.',
  ready: 'Checks the invoice before you export it, and names whatever is missing. Open it to see the list.',
  document: 'The invoice as it will print on A4, in the colours you confirmed for the brand, so what you edit is what your client gets.',
  lines: 'What you are charging for. Each line is a quantity and a price, and the amounts are worked out for you.',
}

const sameContent = (a: InvoiceContent, b: InvoiceContent) => JSON.stringify(a) === JSON.stringify(b)

// The invoice workspace: tools for the parts of an invoice in the toolbar, and windows for the document and the line items, on
// the shared workspace shell. The document is drawn in the founder's confirmed palette. The project remembers the founder's
// business, their clients and their invoices, so none is typed twice, but only what the founder confirms: Save opens a note of what
// would be remembered, and nothing is kept unless it is confirmed. Leaving an invoice with unsaved changes asks first.
export default function InvoiceWorkspace({ projectId, projectName, state, dispatch, onReplace, saveSignal, onConfirmed, headerSlots }: Props) {
  const [memory, setMemory] = useState<ProjectMemory>(() => loadMemory(projectId))
  const [arrangementSave, setArrangementSave] = useState(() => loadInvoice(projectId))
  const [saveFailed, setSaveFailed] = useState(false)
  const [leaving, setLeaving] = useState<{ what: string; run: () => void } | null>(null)

  const doc = invoiceDocOf(state)
  const { content } = doc
  // How the invoice was when this workspace opened on it, so an invoice nobody has touched is not "changed".
  const [opened] = useState(content)

  // The brand: the palette the founder confirmed for this project, or the starter palette until there is one.
  const roles = useMemo(() => resolveRoles(loadPalette(projectId)?.blocks ?? starterBlocks()), [projectId])

  const saved = savedInvoice(memory, doc.invoiceId)
  const unsaved = isInvoiceUnsaved(doc, saved, arrangementSave)
  // Changes that would be lost on leaving: anything different from what was confirmed, or from a new invoice if none was.
  const hasChanges = saved ? !sameContent(content, saved.content) : !sameContent(content, opened)
  const saveStatus = saveFailed ? 'Could not save' : !saved ? 'Not saved yet' : unsaved ? 'Unsaved changes' : 'All changes saved'

  // What confirming would remember, so the founder sees it before anything is kept.
  const business = businessStatus(memory, content.business)
  const client = clientStatus(memory, content.client)
  const number = content.details.number.trim() || 'this invoice'
  const word = content.details.kind === 'quote' ? 'Quote' : 'Invoice'
  const items: ConfirmItem[] = [
    ...(business === 'new' || business === 'updated'
      ? [{ id: 'business', label: 'Your business details', detail: business === 'new' ? `${content.business.name.trim()}, ready on every invoice from now on.` : 'Replaces what is remembered about your business.' }]
      : []),
    ...(client === 'new' || client === 'updated'
      ? [{ id: 'client', label: content.client.name.trim(), detail: client === 'new' ? 'A new client, ready to pick next time.' : 'Replaces what is remembered about this client.' }]
      : []),
    ...(!saved || !sameContent(content, saved.content)
      ? [{ id: 'invoice', label: `${word} ${number}`, detail: saved ? `A new version of it. It keeps its number.` : 'Kept with its number, so it can be opened again.' }]
      : []),
  ]

  const persist = (next: ProjectMemory) => {
    if (saveMemory(projectId, next)) {
      setMemory(next)
      return true
    }
    setSaveFailed(true)
    return false
  }

  // Only what the founder ticked is remembered. How the workspace is arranged is not a memory, so it is kept with it.
  const confirm = (ids: string[]) => {
    const now = new Date().toISOString()
    let next = memory
    if (ids.includes('business')) next = withBusiness(next, content.business, now)
    if (ids.includes('client')) next = withClient(next, content.client, now, newId())
    if (ids.includes('invoice')) next = withInvoice(next, doc.invoiceId, content, now)
    const remembered = next === memory || persist(next)
    const arrangement = saveArrangement(projectId, doc)
    if (arrangement) setArrangementSave(arrangement)
    setSaveFailed(!remembered || arrangement === null)
    if (remembered && arrangement !== null) onConfirmed?.()
  }

  // Leaving saves nothing, so an invoice with changes asks first.
  const guard = (what: string, run: () => void) => (hasChanges ? setLeaving({ what, run }) : run())
  const openInvoice = (id: string) =>
    guard(number, () => {
      const next = openSavedInvoice(projectId, id, doc)
      if (next) onReplace(next)
    })
  const newInvoice = () => guard(number, () => onReplace(openNewInvoice(projectId, doc)))
  const copyInvoice = (id: string) =>
    guard(number, () => {
      const next = duplicateInvoice(projectId, id, doc)
      if (next) onReplace(next)
    })

  const reason = (id: keyof typeof REASONS) => doc.reasons[id] ?? REASONS[id]

  // What the invoice still needs, in code, from what is on it.
  const readiness = useMemo(() => checkInvoice(content, { usedNumbers: numbersInUse(memory, doc.invoiceId) }), [content, memory, doc.invoiceId])

  // Goes to the part of the workspace that fixes something: a tool is shown as a window if it is in the toolbar (or brought back
  // if it was hidden), then the first thing that needs doing in it is focused.
  const fix = useCallback(
    (id: string) => {
      const actions: InvoiceAction[] = []
      if (doc.hidden.includes(id)) actions.push({ type: 'show', component: id })
      if (toolbarTools({ ...doc, hidden: [] }).includes(id)) actions.push({ type: 'expand_tool', id })
      if (actions.length > 0) dispatch({ type: 'batch', actions })
      // The window exists a frame or two later, so it is looked for then.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const part = document.querySelector<HTMLElement>(`.gw__item[data-id="${id}"]`)
          if (!part) return
          part.scrollIntoView?.({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' })
          part.querySelector<HTMLElement>('[aria-invalid="true"], input, textarea, select')?.focus({ preventScroll: true })
        }),
      )
    },
    [doc, dispatch],
  )

  // The toolbar holds each tool as its icon and name. A tick shows once its part of the invoice is complete.
  const done = useMemo(() => stepsDone(readiness), [readiness])
  const tools: Record<string, ShelfTool> = useMemo(
    () => ({
      invoices: { id: 'invoices', title: 'Invoices', icon: BillListIcon, reason: reason('invoices') },
      business: { id: 'business', title: 'Your business', icon: BuildingsIcon, reason: reason('business'), done: done.business },
      client: { id: 'client', title: 'Client', icon: UserIcon, reason: reason('client'), done: done.client },
      terms: { id: 'terms', title: 'Terms', icon: CalendarIcon, reason: reason('terms'), done: done.terms },
      vat: { id: 'vat', title: 'VAT', icon: SaleIcon, reason: reason('vat'), done: done.vat },
      total: { id: 'total', title: 'Total', icon: CalculatorIcon, reason: reason('total'), done: done.total },
      ready: { id: 'ready', title: 'Ready to export?', icon: CheckCircleIcon, reason: reason('ready'), done: done.ready },
    }),
    // reason() only reads doc.reasons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.reasons, done],
  )

  const windows: Record<string, WorkspaceItem> = useMemo(() => {
    const card = (node: ReactNode) => <div className="workspace__card">{node}</div>
    const panel = (id: string, title: string, node: ReactNode, extra: Partial<WorkspaceItem> = {}): WorkspaceItem => ({
      id,
      title,
      w: INVOICE_WINDOW_SIZES[id].w,
      minCols: 6,
      node: card(node),
      ...extra,
    })
    return {
      document: panel('document', 'Invoice', <InvoiceDocument content={content} roles={roles} reason={reason('document')} />, { distance: 0.12, minCols: 8 }),
      lines: panel('lines', 'Line items', <LineItemsEditor lines={content.lines} vatRegistered={content.vatRegistered} dispatch={dispatch} reason={reason('lines')} />, { delay: 0.5, distance: 0.6, minCols: 8 }),
      invoices: panel('invoices', 'Invoices', <InvoicesWindow currentId={doc.invoiceId} current={content} saved={memory.invoices} onOpen={openInvoice} onNew={newInvoice} onCopy={copyInvoice} onForget={(id) => persist(forgetInvoice(memory, id))} reason={reason('invoices')} />, { tool: true, distance: 0.3 }),
      business: panel('business', 'Your business', <BusinessWindow business={content.business} status={business} onForget={() => persist(forgetBusiness(memory))} dispatch={dispatch} reason={reason('business')} />, { tool: true, distance: 0.3 }),
      client: panel('client', 'Client', <ClientWindow client={content.client} status={client} remembered={memory.clients} onForget={(id) => persist(forgetClient(memory, id))} dispatch={dispatch} reason={reason('client')} />, { tool: true, distance: 0.3 }),
      terms: panel('terms', 'Invoice details', <DetailsWindow details={content.details} dispatch={dispatch} reason={reason('terms')} />, { tool: true, distance: 0.3 }),
      vat: panel('vat', 'VAT', <VatWindow content={content} dispatch={dispatch} reason={reason('vat')} />, { tool: true, distance: 0.3 }),
      total: panel('total', 'Totals', <TotalsWindow content={content} reason={reason('total')} />, { tool: true, distance: 0.3 }),
      ready: panel('ready', 'Ready to export?', <ReadyWindow readiness={readiness} onFix={(issue: Issue) => fix(issue.fix)} reason={reason('ready')} />, { tool: true, distance: 0.3 }),
    }
    // reason() only reads doc.reasons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // The open, new and copy handlers read the latest state each time they are called.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, doc.reasons, doc.invoiceId, roles, dispatch, readiness, fix, memory, business, client])

  return (
    <>
      <WorkspaceShell
        spec={INVOICE_SPEC}
        arrangement={doc}
        dispatch={dispatch}
        tools={tools}
        windows={windows}
        toolbar="steps"
        canUndo={canUndoInvoice(state)}
        canRedo={canRedoInvoice(state)}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        saveStatus={saveStatus}
        unsaved={unsaved}
        onSave={() => {}}
        saveControl={<ConfirmSave projectName={projectName} items={items} unsaved={unsaved} status={saveStatus} onConfirm={confirm} openSignal={saveSignal} />}
        exportButton={
          <ExportButton
            onExport={async () => {
              const exported = await exportInvoice(content, roles)
              // An invoice that was confirmed is marked as exported, so it is not picked up as a draft again.
              if (exported && saved && sameContent(content, saved.content)) persist(markExported(memory, doc.invoiceId, new Date().toISOString()))
              return exported
            }}
            ariaLabel="Export the invoice as a PDF"
            doneMessage="The invoice was downloaded."
            failedMessage="Could not make the invoice PDF."
            blocked={
              readiness.ready
                ? undefined
                : {
                    reason: `${readiness.required.length === 1 ? '1 thing needs' : `${readiness.required.length} things need`} fixing before you can export.`,
                    onBlocked: () => fix('ready'),
                  }
            }
          />
        }
        headerSlots={headerSlots}
      />
      {leaving && (
        <LeaveDialog
          what={leaving.what}
          onStay={() => setLeaving(null)}
          onLeave={() => {
            const { run } = leaving
            setLeaving(null)
            run()
          }}
        />
      )}
    </>
  )
}
