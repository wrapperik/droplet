import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, DisketteIcon, RestartIcon, UndoLeftIcon, UndoRightIcon } from '@solar-icons/react/linear'
import {
  arrangementIsDefault,
  isExpanded,
  isVisible,
  mergeLayout,
  shownWindows,
  toolbarTools,
  type Arrangement,
  type ArrangementAction,
  type ArrangementSpec,
} from '../lib/arrangement.ts'
import type { Heights, Placement } from '../lib/gridLayout.ts'
import ComponentsMenu from './ComponentsMenu.tsx'
import GridWorkspace, { type GridHandle, type Incoming, type WorkspaceItem } from './GridWorkspace.tsx'
import ToolShelf, { type Outside, type ShelfHandle, type ShelfTool } from './ToolShelf.tsx'
import './WorkspaceShell.css'

// True when the key press belongs to a text field, which has its own undo.
const inTextField = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export type HeaderSlots = { start: HTMLElement | null; end: HTMLElement | null; shelf: HTMLElement | null }

type Props = {
  // What the task's components are, and where they start.
  spec: ArrangementSpec
  arrangement: Arrangement
  dispatch: (action: ArrangementAction) => void
  // Each tool as it is in the toolbar, and each window as it is on the grid (including the windows that tools become), by id.
  tools: Record<string, ShelfTool>
  windows: Record<string, WorkspaceItem>
  // History.
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  // Saving. Nothing is saved until the founder saves. A task with more to confirm than a single save gives its own control, which
  // replaces the plain one.
  saveStatus: string
  unsaved: boolean
  onSave: () => void
  saveControl?: ReactNode
  // 'steps' draws each tool in the toolbar as its icon and name with a tick once its part is done, and keeps it there while it is
  // open as a window. The default shows the tool's own controls, and a tool that is open leaves the bar.
  toolbar?: 'tools' | 'steps'
  // The task's own export button, at the right of the header.
  exportButton: ReactNode
  // Reports where each window is drawn and how tall, so the AI can place one component relative to another.
  onResolved?: (resolved: Placement[], heights: Heights) => void
  // Where the controls go: the left and right of the screen's fixed header, beside the logo, and the toolbar beneath it.
  // Without them the controls are drawn above the grid.
  headerSlots?: HeaderSlots
}

// Everything about a workspace that is the same whatever the task: the toolbar of tools, the grid of windows, dragging a tool
// out to be a window and back, the header controls (history, windows, reset, save, export), and the keyboard shortcuts for undo.
// A task gives it components and a state to arrange, and it does the rest.
export default function WorkspaceShell({
  spec,
  arrangement,
  dispatch,
  tools,
  windows,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saveStatus,
  unsaved,
  onSave,
  saveControl,
  exportButton,
  toolbar = 'tools',
  onResolved,
  headerSlots,
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
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || inTextField(event.target)) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redoStep()
        else undoStep()
      } else if (key === 'y') {
        event.preventDefault()
        redoStep()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undoStep, redoStep])

  const moveTool = useCallback((id: string, before: string | null) => dispatch({ type: 'move_tool', id, before }), [dispatch])
  const resize = useCallback((id: string, value: number) => dispatch({ type: 'resize', id, value }), [dispatch])

  // A tool carried out of the toolbar becomes a window where it is let go. While it is carried, the grid outlines where.
  const shelfControl = useRef<ShelfHandle | null>(null)
  const gridControl = useRef<GridHandle | null>(null)
  const [incoming, setIncoming] = useState<Incoming | null>(null)
  const incomingOf = useCallback(
    (outside: Outside): Incoming => ({
      id: outside.id,
      left: outside.left,
      top: outside.top,
      w: spec.windowSizes[outside.id].w,
      heightPx: spec.windowSizes[outside.id].heightPx,
    }),
    [spec],
  )
  const carryOut = useCallback((outside: Outside | null) => setIncoming(outside ? incomingOf(outside) : null), [incomingOf])
  const expandTool = (outside: Outside) => {
    const placed = gridControl.current?.place(incomingOf(outside))
    dispatch({ type: 'expand_tool', id: outside.id, ...(placed ? { layout: mergeLayout(arrangement.layout, placed) } : {}) })
    setIncoming(null)
  }
  const returnTool = useCallback((id: string, before: string | null) => dispatch({ type: 'collapse_tool', id, before }), [dispatch])

  // Hidden windows, and tools that are in the toolbar, are off the grid, and keep their place in the layout for when they come back.
  const shown = shownWindows(spec, arrangement)
  const visibleItems = shown.map((id) => windows[id]).filter(Boolean)
  const visibleLayout = arrangement.layout.filter((placement) => shown.includes(placement.id))
  const changeVisibleLayout = (next: Placement[]) => dispatch({ type: 'layout', layout: mergeLayout(arrangement.layout, next) })
  const steps = toolbar === 'steps'
  // In steps mode every tool stays in the bar, open or not.
  const shelfIds = steps ? arrangement.tools.filter((id) => isVisible(arrangement, id)) : toolbarTools(arrangement)
  const shelfTools = shelfIds.map((id) => tools[id]).filter(Boolean)
  const toggleTool = useCallback(
    (id: string) => dispatch(isExpanded(arrangement, id) ? { type: 'collapse_tool', id } : { type: 'expand_tool', id }),
    [dispatch, arrangement],
  )

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
      <ComponentsMenu
        components={spec.components}
        kind="panel"
        hidden={arrangement.hidden}
        onShow={(component) => dispatch({ type: 'show', component })}
        onHide={(component) => dispatch({ type: 'hide', component })}
      />
      <button type="button" className="workspace__button" disabled={arrangementIsDefault(spec, arrangement)} onClick={() => dispatch({ type: 'reset_layout' })}>
        <RestartIcon size={18} aria-hidden="true" />
        <span className="workspace__label">Reset layout</span>
      </button>
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

  const shelf = (
    <ToolShelf
      tools={shelfTools}
      onMove={moveTool}
      onOutside={carryOut}
      onExpand={expandTool}
      controlRef={shelfControl}
      steps={steps ? { open: arrangement.expanded, onToggle: toggleTool } : undefined}
      add={
        <ComponentsMenu
          components={spec.components}
          kind="toolbar"
          hidden={arrangement.hidden}
          onShow={(component) => dispatch({ type: 'show', component })}
          onHide={(component) => dispatch({ type: 'hide', component })}
        />
      }
    />
  )

  const place = (slot: HTMLElement | null | undefined, controls: ReactNode) =>
    headerSlots ? slot && createPortal(controls, slot) : <div className="workspace__actions">{controls}</div>

  return (
    <div className="workspace">
      {place(headerSlots?.start, startControls)}
      {place(headerSlots?.end, endControls)}
      {headerSlots ? headerSlots.shelf && createPortal(shelf, headerSlots.shelf) : shelf}
      <p className="visually-hidden" role="status">
        {historyNote}
      </p>

      <GridWorkspace
        items={visibleItems}
        layout={visibleLayout}
        onLayoutChange={changeVisibleLayout}
        onResize={resize}
        onResolved={onResolved}
        incoming={incoming}
        controlRef={gridControl}
        shelf={shelfControl}
        onReturn={returnTool}
      />
    </div>
  )
}
