import { useCallback, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, DisketteIcon, UndoLeftIcon, UndoRightIcon } from '@solar-icons/react/linear'
import { useUndoKeys } from '../hooks/useUndoKeys.ts'
import './WorkspaceShell.css'

export type HeaderSlots = { start: HTMLElement | null; end: HTMLElement | null; shelf: HTMLElement | null }

type Props = {
  // The task bar, under the header.
  bar: ReactNode
  // History.
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  // Saving. Nothing is saved until the founder saves. A task with more to confirm than a single save gives its own control, which replaces the plain one.
  saveStatus: string
  unsaved: boolean
  onSave: () => void
  saveControl?: ReactNode
  // The task's own export button, at the right of the header.
  exportButton: ReactNode
  // A menu that belongs to the task, at the left of the header after undo and redo (the invoice's list of invoices).
  startExtra?: ReactNode
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
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saveStatus,
  unsaved,
  onSave,
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

  const framed = thing !== undefined || panel !== undefined

  return (
    <>
      {place(headerSlots?.start, startControls)}
      {place(headerSlots?.end, endControls)}
      {headerSlots ? headerSlots.shelf && createPortal(bar, headerSlots.shelf) : bar}
      <p className="visually-hidden" role="status">
        {historyNote}
      </p>

      {framed && (
        <div className="frame">
          <div className="frame__stage">
            <div className="frame__pane frame__pane--thing" role="region" aria-label={thingLabel}>
              {thing}
            </div>
            <div className="frame__side">
              <div className="frame__pane frame__pane--panel" role="region" aria-label={panelLabel}>
                {panel}
              </div>
              {footer}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
