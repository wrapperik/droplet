import { useCallback, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AltArrowLeftIcon, AltArrowRightIcon, CheckIcon, UndoLeftIcon, UndoRightIcon } from '@solar-icons/react/linear'
import { useDismiss } from '../../hooks/useDismiss.ts'
import { useUndoKeys } from '../../hooks/useUndoKeys.ts'
import { stepBlockers, advance, back, goTo, invoiceResultOf, jumpTo, stepIndex, stepOfFix, GUIDE_LEADS, GUIDE_STEPS, GUIDE_SHORT, GUIDE_TITLES, type GuideProgress, type GuideStepId, type InvoiceResult } from '../../lib/invoiceGuide.ts'
import type { Issue } from '../../lib/invoiceReadiness.ts'
import { forgetBusiness, forgetClient, settingOn } from '../../lib/projectMemory.ts'
import { canRedoInvoice, canUndoInvoice, type InvoiceAction, type InvoiceState } from '../../lib/invoiceState.ts'
import type { HeaderSlots } from '../WorkspaceShell.tsx'
import ConfirmSave, { ConfirmNote } from './ConfirmSave.tsx'
import InvoiceDocument from './InvoiceDocument.tsx'
import { BusinessWindow, ClientWindow, DetailsWindow, VatWindow } from './InvoiceWindows.tsx'
import LineItemsEditor from './LineItemsEditor.tsx'
import { ReadyWindow } from './ReadyPanel.tsx'
import { useInvoiceMemory } from './useInvoiceMemory.ts'
import '../WorkspaceShell.css'
import './GuidedInvoice.css'

type Props = {
  projectId: string
  projectName: string
  state: InvoiceState
  dispatch: (action: InvoiceAction) => void
  // Where the founder is in the guide. Held by Home, so it outlasts a visit to another workspace.
  progress: GuideProgress
  onProgress: (progress: GuideProgress) => void
  // The invoice is finished: confirmed, saved and ready. Home closes it and shows the result in the chat.
  onFinished: (result: InvoiceResult) => void
  // As for the workspace: the chat asks for the note of what would be remembered, and is told when the founder confirmed.
  saveSignal?: number
  onConfirmed?: () => void
  headerSlots?: HeaderSlots
}

// Guide mode for the invoice: one part of it at a time, in the middle of the screen, with the invoice as it will print beside it. The order is
// fixed in code. Continue moves on once nothing required of the step is missing, and says what is if something is. The last step is the whole
// invoice and what it still needs; Finish opens the same note of what would be remembered as Save does, and only once the founder confirms is
// the invoice finished. The composer works on the same invoice through the same reducer, so what it fills in shows here at once.
export default function GuidedInvoice({ projectId, projectName, state, dispatch, progress, onProgress, onFinished, saveSignal, onConfirmed, headerSlots }: Props) {
  const { memory, doc, content, roles, unsaved, saveStatus, business, client, items, persist, confirm, readiness } = useInvoiceMemory(projectId, state, onConfirmed)
  const { step } = progress
  const index = stepIndex(step)
  const last = index === GUIDE_STEPS.length - 1

  // What was missing when Continue or Finish was pressed. Each goes as soon as it is fixed.
  const [blocked, setBlocked] = useState<Issue[]>([])
  const stillBlocked = blocked.filter((issue) => stepBlockers(step, readiness).some((now) => now.id === issue.id))
  const [finishing, setFinishing] = useState(false)
  const [finishNote, setFinishNote] = useState('')
  const finishRef = useRef<HTMLDivElement>(null)
  const closeFinish = useCallback(() => setFinishing(false), [])
  useDismiss(finishing, closeFinish, finishRef)

  // The step on screen. When the founder moves to a step, its first field takes the cursor as soon as the step is there (after the last one has gone),
  // never when the guide first opens: the message bar keeps the cursor then.
  const cardEl = useRef<HTMLDivElement | null>(null)
  const moved = useRef(false)
  const cardRef = useCallback((node: HTMLDivElement | null) => {
    cardEl.current = node
    if (!node || !moved.current) return
    moved.current = false
    // A field first (the info button in the step's title comes before them on the page), or the step itself when it has none.
    const field = node.querySelector<HTMLElement>('input, textarea, select') ?? node
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

  const undo = useCallback(() => {
    if (canUndoInvoice(state)) dispatch({ type: 'undo' })
  }, [state, dispatch])
  const redo = useCallback(() => {
    if (canRedoInvoice(state)) dispatch({ type: 'redo' })
  }, [state, dispatch])
  useUndoKeys(undo, redo)

  const lead = GUIDE_LEADS[step]
  const body: Record<GuideStepId, ReactNode> = {
    business: <BusinessWindow business={content.business} status={business} onForget={() => persist(forgetBusiness(memory))} dispatch={dispatch} reason={lead} />,
    vat: <VatWindow content={content} dispatch={dispatch} reason={lead} />,
    client: <ClientWindow client={content.client} status={client} remembered={memory.clients} onForget={(id) => persist(forgetClient(memory, id))} dispatch={dispatch} reason={lead} />,
    lines: <LineItemsEditor lines={content.lines} vatRegistered={content.vatRegistered} dispatch={dispatch} reason={lead} />,
    terms: <DetailsWindow details={content.details} dispatch={dispatch} reason={lead} />,
    review: <ReadyWindow readiness={readiness} onFix={(issue) => move(jumpTo(progress, stepOfFix(issue.fix)))} reason={lead} />,
  }

  const preview = <InvoiceDocument content={content} roles={roles} reason="The invoice as it will print on A4, in the colours you confirmed for the brand. It changes as you fill in each step." />

  const startControls = (
    <div className="workspace__history" role="group" aria-label="History">
      <button type="button" className="workspace__icon-button" disabled={!canUndoInvoice(state)} onClick={undo} aria-label="Undo">
        <UndoLeftIcon size={18} aria-hidden="true" />
      </button>
      <button type="button" className="workspace__icon-button" disabled={!canRedoInvoice(state)} onClick={redo} aria-label="Redo">
        <UndoRightIcon size={18} aria-hidden="true" />
      </button>
    </div>
  )
  // Save stays in the header, so the founder can keep what they have and come back to it. It is the same confirm note as everywhere.
  const endControls = <ConfirmSave projectName={projectName} items={items} unsaved={unsaved} status={saveStatus} onConfirm={(ids) => void confirm(ids)} openSignal={saveSignal} notesOn={settingOn(memory, 'notes')} />

  return (
    <div className="guide" data-step={step}>
      {headerSlots?.start && createPortal(startControls, headerSlots.start)}
      {headerSlots?.end && createPortal(endControls, headerSlots.end)}

      <nav className="guide__progress" aria-label="Invoice steps">
        <ol className="guide__steps">
          {GUIDE_STEPS.map((id, place) => {
            const reached = place <= progress.reached
            const complete = reached && id !== step && (id === 'review' ? readiness.ready : stepBlockers(id, readiness).length === 0)
            return (
              <li key={id}>
                <button
                  type="button"
                  className="guide__step"
                  aria-current={id === step ? 'step' : undefined}
                  disabled={!reached}
                  onClick={() => move(goTo(progress, id))}
                  aria-label={`Step ${place + 1}, ${GUIDE_TITLES[id]}${complete ? ', complete' : ''}${reached ? '' : ', not reached yet'}`}
                >
                  <span className="guide__step-mark" data-complete={complete || undefined} aria-hidden="true">
                    {complete ? <CheckIcon size={12} strokeWidth={2.5} /> : place + 1}
                  </span>
                  <span className="guide__step-name">{GUIDE_SHORT[id]}</span>
                </button>
              </li>
            )
          })}
        </ol>
        <p className="guide__lead">{lead}</p>
      </nav>
      <p className="visually-hidden" role="status">{`Step ${index + 1} of ${GUIDE_STEPS.length}: ${GUIDE_TITLES[step]}.`}</p>

      {/* Two panes that scroll on their own: the page on the left, the step on the right, which stays where it is while the page is scrolled. */}
      <div className={last ? 'guide__stage guide__stage--review' : 'guide__stage'}>
        <div className="guide__pane guide__pane--preview">
          <aside className="guide__preview workspace__card" aria-label="Preview">
            {preview}
          </aside>
        </div>
        <div className="guide__pane guide__pane--step">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              ref={cardRef}
              tabIndex={-1}
              className="guide__card workspace__card"
              initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <p className="guide__count">{`Step ${index + 1} of ${GUIDE_STEPS.length}`}</p>
              {body[step]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="guide__actions">
        <button type="button" className="workspace__button" onClick={() => move(back(progress))} disabled={index === 0}>
          <AltArrowLeftIcon size={18} aria-hidden="true" />
          <span>Back</span>
        </button>
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
      </div>
    </div>
  )
}
