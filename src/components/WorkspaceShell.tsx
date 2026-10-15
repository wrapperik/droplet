import { useCallback, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, DisketteIcon, UndoLeftIcon, UndoRightIcon } from '@solar-icons/react/linear'
import { useUndoKeys } from '../hooks/useUndoKeys.ts'
import './WorkspaceShell.css'

export type HeaderSlots = { start: HTMLElement | null; end: HTMLElement | null; shelf: HTMLElement | null }

// What a task's own toolbar needs of the shell's history handling, so its Undo and Redo buttons do exactly what the keyboard shortcuts do and announce the same.
export type ShellHistory = { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void }

type Props = {
  // The task bar, under the header. A task that has nothing to show there (the brand in Workspace mode) leaves it out.
  bar?: ReactNode
  // History.
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  // Saving. Nothing is saved until the founder saves. A task with more to confirm than a single save gives its own control, which replaces the plain one.
  saveStatus?: string
  unsaved?: boolean
  onSave?: () => void
  saveControl?: ReactNode
  // The task's own export button, at the right of the header.
  exportButton?: ReactNode
  // A menu that belongs to the task, at the left of the header after undo and redo (the invoice's list of invoices).
  startExtra?: ReactNode
  // A task that carries its own controls in a toolbar row across the top of its frame (the brand) gives it here, and the shell then puts nothing in the
  // header's slots: no history, save or export there, so nothing is on screen twice. The toolbar is given the shell's history, so Undo and Redo behave the
  // same as the keyboard shortcuts. It sits above both panes and does not scroll with them.
  toolbar?: (history: ShellHistory) => ReactNode
  // The frame with the tools panel on the left and the thing on the right, instead of the other way round. The order in the document follows the order on
  // screen, so the cursor reaches the tools first.
  swap?: boolean
  // The tools panel and its footer are hidden and the thing has the whole width. The toolbar stays. They stay mounted, so nothing in them is lost.
  hidePanel?: boolean
  // Where the controls go: the left and right of the screen's fixed header, beside the logo, and the bar beneath it. Without them they are drawn above the panes.
  headerSlots?: HeaderSlots
  // The frame: the thing being made on the left (three fifths), the tools panel on the right (two fifths), and an optional footer under the panel (Guide mode).
  // Both scroll on their own. Under 42rem they become one column, the panel first, in the same tree, so nothing remounts. A task whose canvas fills the whole screen
  // (the board) gives neither and draws its own.
  thing?: ReactNode
  panel?: ReactNode
  footer?: ReactNode
  // The panel's accessible name and the thing's.
  thingLabel?: string
  panelLabel?: string
}

// Everything about a workspace that is the same whatever the task and whichever mode: the header controls (history, the task's menu, save, export), the task bar,
// the two panes, and the keyboard shortcuts for undo. A task gives it the parts and a state; where things sit never changes and nothing is moved, resized, hidden
// or opened as a window. Popovers and dialogs are the only things that open.
export default function WorkspaceShell({
  bar,
  toolbar,
  swap = false,
  hidePanel = false,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saveStatus = '',
  unsaved = false,
  onSave = () => {},
  saveControl,
  exportButton,
  startExtra,
  headerSlots,
  thing,
  panel,
  footer,
  thingLabel = 'The work',
  panelLabel = 'Tools',
}: Props) {
  const [historyNote, setHistoryNote] = useState('')

  const undoStep = useCallback(() => {
    if (!canUndo) return
    onUndo()
    setHistoryNote('Undone.')
  }, [canUndo, onUndo])

  const redoStep = useCallback(() => {
    if (!canRedo) return
    onRedo()
    setHistoryNote('Redone.')
  }, [canRedo, onRedo])

  // Ctrl or Cmd with Z undoes, with Shift (or Y) redoes. A text field keeps its own undo.
  useUndoKeys(undoStep, redoStep)

  const startControls = (
    <>
      <div className="workspace__history" role="group" aria-label="History">
        <button type="button" className="workspace__icon-button" disabled={!canUndo} onClick={undoStep} aria-label="Undo">
          <UndoLeftIcon size={18} aria-hidden="true" />
        </button>
        <button type="button" className="workspace__icon-button" disabled={!canRedo} onClick={redoStep} aria-label="Redo">
          <UndoRightIcon size={18} aria-hidden="true" />
        </button>
      </div>
      {startExtra}
    </>
  )

  const endControls = (
    <>
      {saveControl ?? (
        <>
          <span className="workspace__status" role="status">
            {saveStatus}
          </span>
          <button type="button" className="workspace__button workspace__button--primary" disabled={!unsaved} onClick={onSave}>
            {unsaved ? <DisketteIcon size={18} aria-hidden="true" /> : <CheckIcon size={18} aria-hidden="true" />}
            <span className="workspace__label">{unsaved ? 'Save' : 'Saved'}</span>
          </button>
        </>
      )}
      {exportButton}
    </>
  )

  const place = (slot: HTMLElement | null | undefined, controls: ReactNode) =>
    headerSlots ? slot && createPortal(controls, slot) : <div className="workspace__actions">{controls}</div>

  const framed = thing !== undefined || panel !== undefined || toolbar !== undefined

  const thingPane = (
    <div className="wsframe__pane wsframe__pane--thing" role="region" aria-label={thingLabel}>
      {thing}
    </div>
  )
  const side = (
    <div className="wsframe__side" hidden={hidePanel || undefined}>
      <div className="wsframe__pane wsframe__pane--panel" role="region" aria-label={panelLabel}>
        {panel}
      </div>
      {footer}
    </div>
  )

  return (
    <>
      {!toolbar && place(headerSlots?.start, startControls)}
      {!toolbar && place(headerSlots?.end, endControls)}
      {bar && (headerSlots ? headerSlots.shelf && createPortal(bar, headerSlots.shelf) : bar)}
      <p className="visually-hidden" role="status">
        {historyNote}
      </p>

      {framed && (
        <div className="wsframe" data-swap={swap || undefined} data-full={hidePanel || undefined}>
          {toolbar?.({ canUndo, canRedo, undo: undoStep, redo: redoStep })}
          <div className="wsframe__stage">
            {swap ? (
              <>
                {side}
                {thingPane}
              </>
            ) : (
              <>
                {thingPane}
                {side}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
