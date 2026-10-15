import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AltArrowLeftIcon, AltArrowRightIcon, BuildingsIcon, CalendarIcon, CheckCircleIcon, CheckIcon, ListCheckIcon, SaleIcon, UserIcon } from '@solar-icons/react/linear'
import type { Icon } from '@solar-icons/react/lib/types'
import { useDismiss } from '../../hooks/useDismiss.ts'
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
  // Asks for the note of what would be remembered to be opened (each change of the number is one ask), as the chat does when the founder is about to leave.
  // And told when the founder has confirmed.
  saveSignal?: number
  onConfirmed?: () => void
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
export default function InvoiceWorkspace({ mode, projectId, projectName, state, dispatch, onReplace, progress, onProgress, onFinished, saveSignal, onConfirmed, logoVersion, onOpenHandoff, headerSlots }: Props) {
  const { memory, logo, doc, content, roles, saved, unsaved, hasChanges, saveStatus, business, client, number, items, persist, confirm, readiness } = useInvoiceMemory(projectId, state, onConfirmed, logoVersion)
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

  // The part on screen in Guide mode. When the founder moves to a part, its first field takes the cursor as soon as the part is there (after the last one has gone),
  // never when the guide first opens: the message bar keeps the cursor then.
  const cardEl = useRef<HTMLDivElement | null>(null)
  const moved = useRef(false)
  const cardRef = useCallback((node: HTMLDivElement | null) => {
    cardEl.current = node
    if (!node || !moved.current) return
    moved.current = false
    // A field first (the heading comes before them on the page), or the part itself when it has none.
    const field = node.querySelector<HTMLElement>('input, textarea, select') ?? node.querySelector<HTMLElement>('[data-part]') ?? node
    field.focus({ preventScroll: true })
  }, [])

  const move = (next: GuideProgress) => {
    if (next === progress) return
    moved.current = true
    setBlocked([])
    setFinishNote('')
    onProgress(next)
  }

  const showBlocked = (issues: Issue[]) => {
    setBlocked(issues)
    cardEl.current?.querySelector<HTMLElement>('[aria-invalid="true"], input, textarea, select')?.focus({ preventScroll: true })
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
      <InvoiceDocument content={content} roles={roles} reason="The invoice as it will print on A4, in the colours you confirmed for the brand. It changes as you fill in each part." logo={logo} onOpenHandoff={onOpenHandoff} />
    </div>
  )

  const footer = guided && (
    <div className="guide__actions">
      <button type="button" className="workspace__button" onClick={() => move(back(progress))} disabled={index === 0}>
        <AltArrowLeftIcon size={18} aria-hidden="true" />
        <span>Back</span>
      </button>
      {last ? (
        <div className="confirm" ref={finishRef}>
          <button type="button" className="workspace__button workspace__button--primary" onClick={finish} aria-haspopup="dialog" aria-expanded={finishing}>
            <CheckIcon size={18} aria-hidden="true" />
            <span>Finish</span>
          </button>
          <AnimatePresence>
            {finishing && <ConfirmNote above projectName={projectName} items={items} notesOn={settingOn(memory, 'notes')} confirmLabel="Save and finish" onConfirm={(ids) => void confirmFinish(ids)} onCancel={closeFinish} />}
          </AnimatePresence>
        </div>
      ) : (
        <button type="button" className="workspace__button workspace__button--primary guide__next" onClick={next}>
          <span>Continue</span>
          <AltArrowRightIcon size={18} aria-hidden="true" />
        </button>
      )}
      <div className="guide__missing" role="alert">
        {finishNote ? (
          <p>{finishNote}</p>
        ) : (
          stillBlocked.length > 0 && (
            <>
              <p className="guide__missing-title">{last ? 'Before you can finish:' : 'Before you go on:'}</p>
              <ul>
                {stillBlocked.slice(0, 4).map((issue) => (
                  <li key={issue.id}>{issue.text}</li>
                ))}
                {stillBlocked.length > 4 && <li>{`And ${stillBlocked.length - 4} more.`}</li>}
              </ul>
            </>
          )
        )}
      </div>
    </div>
  )

  const panel = guided ? (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={step}
        ref={cardRef}
        tabIndex={-1}
        className="guide__card"
        initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <p className="guide__count">{`Step ${index + 1} of ${GUIDE_STEPS.length}`}</p>
        {section(step)}
      </motion.div>
    </AnimatePresence>
  ) : (
    <div className="frame__parts" onFocusCapture={noteFocus}>
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
        saveControl={<ConfirmSave projectName={projectName} items={items} unsaved={unsaved} status={saveStatus} onConfirm={(ids) => void confirm(ids)} openSignal={saveSignal} notesOn={settingOn(memory, 'notes')} />}
        exportButton={
          <ExportButton
            onExport={async () => {
              const exported = await exportInvoice(content, roles, logo)
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
