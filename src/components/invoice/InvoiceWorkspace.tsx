import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence } from 'framer-motion'
import { BuildingsIcon, CalendarIcon, CheckCircleIcon, ListCheckIcon, SaleIcon, UserIcon } from '@solar-icons/react/linear'
import type { Icon } from '@solar-icons/react/lib/types'
import { useDismiss } from '../../hooks/useDismiss.ts'
import { useGuideCard } from '../../hooks/useGuideCard.ts'
import { exportInvoice } from '../../lib/exportInvoice.ts'
import { partsDone, type Issue } from '../../lib/invoiceReadiness.ts'
import {
  GUIDE_LEADS,
  GUIDE_SHORT,
  GUIDE_STEPS,
  GUIDE_TITLES,
  advance,
  back,
  goTo,
  invoiceResultOf,
  jumpTo,
  stepBlockers,
  stepIndex,
  stepOfFix,
  type GuideProgress,
  type GuideStepId,
  type InvoiceResult,
} from '../../lib/invoiceGuide.ts'
import { duplicateInvoice, openNewInvoice, openSavedInvoice } from '../../lib/invoiceStore.ts'
import { canRedoInvoice, canUndoInvoice, type InvoiceAction, type InvoiceState } from '../../lib/invoiceState.ts'
import { scrollToPart } from '../../lib/partNav.ts'
import { forgetBusiness, forgetClient, forgetInvoice, markExported, settingOn } from '../../lib/projectMemory.ts'
import ExportButton from '../ExportButton.tsx'
import GuideCard from '../GuideCard.tsx'
import GuideFooter from '../GuideFooter.tsx'
import PartSection from '../PartSection.tsx'
import TaskBar, { type BarItem } from '../TaskBar.tsx'
import WorkspaceShell, { type HeaderSlots } from '../WorkspaceShell.tsx'
import ConfirmSave, { ConfirmNote } from './ConfirmSave.tsx'
import InvoiceDocument from './InvoiceDocument.tsx'
import { BusinessPart, ClientPart, DetailsPart, TotalsPart, VatPart } from './InvoiceParts.tsx'
import InvoicesMenu from './InvoicesMenu.tsx'
import LeaveDialog from './LeaveDialog.tsx'
import LineItemsEditor from './LineItemsEditor.tsx'
import { ReadyPart } from './ReadyPanel.tsx'
import { sameContent, useInvoiceMemory } from './useInvoiceMemory.ts'
import './InvoiceWorkspace.css'

type Props = {
  // Workspace mode shows every part of the invoice stacked in the panel; Guide mode shows one at a time, with Back and Continue. Everything else is the same.
  mode: 'guide' | 'workspace'
  projectId: string
  projectName: string
  state: InvoiceState
  dispatch: (action: InvoiceAction) => void
  // Another invoice takes the workspace's place: a new one, or one that was saved.
  onReplace: (state: InvoiceState) => void
  // Where the founder is in the guide. Held by Home, so it outlasts a visit to another workspace, and a switch of mode.
  progress: GuideProgress
  onProgress: (progress: GuideProgress) => void
  // The invoice is finished in Guide mode: confirmed, saved and ready. Home closes it and shows the result in the chat.
  onFinished: (result: InvoiceResult) => void
  // Asks for the note of what would be remembered to be opened, as the dialog about unsaved work does when the founder is about to leave. Home
  // clears the request once it is handled. And told when the founder has confirmed.
  saveRequest?: boolean
  onSaveRequestHandled?: () => void
  onConfirmed?: () => void
  // The note of what would be remembered closed without being confirmed.
  onSaveCancelled?: () => void
  // Changes when the logo is added or removed on the handoff card, so the page and the PDF read it again. And opens that card.
  logoVersion?: number
  onOpenHandoff?: () => void
  headerSlots?: HeaderSlots
}

// The icon of each part on the task bar.
const PART_ICONS: Record<GuideStepId, Icon> = { business: BuildingsIcon, vat: SaleIcon, client: UserIcon, lines: ListCheckIcon, terms: CalendarIcon, review: CheckCircleIcon }

// The invoice: the page as it will print on the left, the tools panel on the right, in the frame every task shares. The six parts are the same in both modes, with
// the same names in the same order: on the task bar, ticked from the same check the export uses. The project remembers the founder's business, their clients and
// their invoices, so none is typed twice, but only what the founder confirms: Save opens a note of what would be remembered, and nothing is kept unless it is
// confirmed. Leaving an invoice with unsaved changes asks first. The composer works on the same invoice through the same reducer, so what it fills in shows at once.
export default function InvoiceWorkspace({ mode, projectId, projectName, state, dispatch, onReplace, progress, onProgress, onFinished, saveRequest, onSaveRequestHandled, onConfirmed, onSaveCancelled, logoVersion, onOpenHandoff, headerSlots }: Props) {
  const { memory, loaded, logo, storedLogo, fonts, doc, content, roles, saved, unsaved, hasChanges, saveStatus, business, client, number, items, persist, confirm, readiness } = useInvoiceMemory(projectId, state, onConfirmed, logoVersion)
  const guided = mode === 'guide'
  const { step } = progress
  const index = stepIndex(step)
  const last = index === GUIDE_STEPS.length - 1

  // ---- Leaving this invoice for another ----
  const [leaving, setLeaving] = useState<{ what: string; run: () => void | Promise<void> } | null>(null)
  // Leaving saves nothing, so an invoice with changes asks first.
  const guard = (what: string, run: () => void | Promise<void>) => (hasChanges ? setLeaving({ what, run }) : run())
  const openInvoice = (id: string) =>
    guard(number, async () => {
      const next = await openSavedInvoice(projectId, id)
      if (next) onReplace(next)
    })
  const newInvoice = () => guard(number, async () => onReplace(await openNewInvoice(projectId)))
  const copyInvoice = (id: string) =>
    guard(number, async () => {
      const next = await duplicateInvoice(projectId, id)
      if (next) onReplace(next)
    })

  // ---- Guide mode: moving between parts ----
  // What was missing when Continue or Finish was pressed. Each goes as soon as it is fixed.
  const [blocked, setBlocked] = useState<Issue[]>([])
  const stillBlocked = blocked.filter((issue) => stepBlockers(step, readiness).some((now) => now.id === issue.id))
  const [finishing, setFinishing] = useState(false)
  const [finishNote, setFinishNote] = useState('')
  const finishRef = useRef<HTMLDivElement>(null)
  const closeFinish = useCallback(() => setFinishing(false), [])
  useDismiss(finishing, closeFinish, finishRef)

  // The part on screen in Guide mode: where the cursor goes when the founder moves to it (the same for every task).
  const { cardRef, markMoved, focusProblem } = useGuideCard()

  const move = (next: GuideProgress) => {
    if (next === progress) return
    markMoved()
    setBlocked([])
    setFinishNote('')
    onProgress(next)
  }

  const showBlocked = (issues: Issue[]) => {
    setBlocked(issues)
    focusProblem()
  }

  const next = () => {
    const result = advance(progress, readiness)
    if (result.blocked.length > 0) showBlocked(result.blocked)
    else move(result.progress)
  }

  // Finish: only an invoice with nothing required missing, and only through the confirm note. One that is already saved, unchanged, is finished as it is.
  const finish = () => {
    setFinishNote('')
    if (!readiness.ready) return setBlocked(readiness.required)
    if (unsaved) setFinishing(true)
    else onFinished(invoiceResultOf(doc.invoiceId, content))
  }
  const confirmFinish = async (ids: string[]) => {
    const keepsInvoice = ids.includes('invoice') || !items.some((item) => item.id === 'invoice')
    const ok = await confirm(ids)
    if (!ok) return setFinishNote('I could not save the invoice, because it could not be stored. Try again.')
    if (!keepsInvoice) return setFinishNote('The invoice itself was left unticked, so it is not saved and stays open. Finish again and keep it ticked to save it.')
    onFinished(invoiceResultOf(doc.invoiceId, content))
  }

  // ---- Workspace mode: the part in view ----
  const [looking, setLooking] = useState<GuideStepId>(GUIDE_STEPS[0])
  // The part the cursor is in is the one in view.
  const noteFocus = (event: { target: EventTarget }) => {
    const id = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-part]')?.dataset.part : undefined
    if (id && (GUIDE_STEPS as readonly string[]).includes(id)) setLooking(id as GuideStepId)
  }

  // Goes to a part, whichever mode: scrolled to and given the cursor in Workspace mode, jumped to in Guide mode. The Fix buttons and the blocked Export use it.
  const goToPart = (id: GuideStepId) => {
    if (guided) return move(jumpTo(progress, id))
    setLooking(id)
    scrollToPart(id)
  }

  // A press on a part of the bar.
  const select = (id: GuideStepId) => (guided ? move(goTo(progress, id)) : goToPart(id))

  // ---- The parts ----
  const done = useMemo(() => partsDone(readiness), [readiness])
  const body: Record<GuideStepId, ReactNode> = {
    business: <BusinessPart business={content.business} status={business} onForget={() => persist(forgetBusiness(memory))} dispatch={dispatch} />,
    vat: <VatPart content={content} dispatch={dispatch} />,
    client: <ClientPart client={content.client} status={client} remembered={memory.clients} onForget={(id) => persist(forgetClient(memory, id))} dispatch={dispatch} />,
    lines: (
      <>
        <LineItemsEditor lines={content.lines} vatRegistered={content.vatRegistered} dispatch={dispatch} />
        <h3 className="part__subheading">Totals</h3>
        <TotalsPart content={content} />
      </>
    ),
    terms: <DetailsPart details={content.details} dispatch={dispatch} />,
    review: <ReadyPart readiness={readiness} onFix={(issue: Issue) => goToPart(stepOfFix(issue.fix))} />,
  }
  const section = (id: GuideStepId) => (
    <PartSection key={id} id={id} title={GUIDE_TITLES[id]} lead={GUIDE_LEADS[id]}>
      {body[id]}
    </PartSection>
  )

  const bar: BarItem[] = GUIDE_STEPS.map((id, place) => ({
    id,
    title: GUIDE_TITLES[id],
    label: GUIDE_SHORT[id],
    reason: GUIDE_LEADS[id],
    icon: PART_ICONS[id],
    done: done[id],
    current: guided ? (id === step ? 'step' : undefined) : id === looking ? 'location' : undefined,
    // In Guide mode a part further on than the founder has got cannot be skipped to.
    locked: guided && place > progress.reached,
    onSelect: () => select(id),
  }))

  const preview = (
    <div className="workspace__card">
      <InvoiceDocument content={content} roles={roles} reason="The invoice as it will print on A4, in the colours you confirmed for the brand, in the template you choose. It changes as you fill in each part." logo={logo} fonts={fonts} onOpenHandoff={onOpenHandoff} onTemplate={(template) => dispatch({ type: 'set_details', patch: { template } })} />
    </div>
  )

  const footer = guided && (
    <GuideFooter
      canBack={index > 0}
      onBack={() => move(back(progress))}
      last={last}
      onNext={next}
      onFinish={finish}
      finishRef={finishRef}
      finishExpanded={finishing}
      finishPopup={
        <AnimatePresence>
          {finishing && <ConfirmNote above projectName={projectName} items={items} notesOn={settingOn(memory, 'notes')} confirmLabel="Save and finish" onConfirm={(ids) => void confirmFinish(ids)} onCancel={closeFinish} />}
        </AnimatePresence>
      }
      missing={stillBlocked.map((issue) => issue.text)}
      note={finishNote}
    />
  )

  const panel = guided ? (
    <GuideCard stepKey={step} cardRef={cardRef} position={index + 1} of={GUIDE_STEPS.length}>
      {section(step)}
    </GuideCard>
  ) : (
    <div className="wsframe__parts" onFocusCapture={noteFocus}>
      {GUIDE_STEPS.map(section)}
    </div>
  )

  return (
    <>
      <WorkspaceShell
        bar={<TaskBar kind="parts" label="Parts of the invoice" items={bar} />}
        thing={preview}
        thingLabel="The invoice"
        panel={panel}
        panelLabel={guided ? `Step ${index + 1} of ${GUIDE_STEPS.length}: ${GUIDE_TITLES[step]}` : 'The parts of the invoice'}
        footer={footer}
        canUndo={canUndoInvoice(state)}
        canRedo={canRedoInvoice(state)}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        saveStatus={saveStatus}
        unsaved={unsaved}
        onSave={() => {}}
        startExtra={<InvoicesMenu currentId={doc.invoiceId} current={content} saved={memory.invoices} onOpen={openInvoice} onNew={newInvoice} onCopy={copyInvoice} onForget={(id) => persist(forgetInvoice(memory, id))} />}
        saveControl={<ConfirmSave projectName={projectName} items={items} unsaved={unsaved} status={saveStatus} onConfirm={(ids) => void confirm(ids)} openRequest={saveRequest} onOpenHandled={onSaveRequestHandled} ready={loaded} notesOn={settingOn(memory, 'notes')} onCancel={onSaveCancelled} />}
        exportButton={
          <ExportButton
            onExport={async () => {
              const exported = await exportInvoice(content, roles, storedLogo, fonts)
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
                    onBlocked: () => goToPart('review'),
                  }
            }
          />
        }
        headerSlots={headerSlots}
      />
      {guided && (
        <p className="visually-hidden" role="status">
          {`Step ${index + 1} of ${GUIDE_STEPS.length}: ${GUIDE_TITLES[step]}.`}
        </p>
      )}
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
