import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BillListIcon,
  CheckIcon,
  DisketteIcon,
  LayersMinimalisticIcon,
  MagicWand3Icon,
  PaletteIcon,
  RestartIcon,
  TagIcon,
  UndoLeftIcon,
  UndoRightIcon,
} from '@solar-icons/react/linear'
import type { Heights, Placement } from '../lib/gridLayout.ts'
import { replaceableIds } from '../lib/harmony.ts'
import { resolveRoles, type ColourRole } from '../lib/palette.ts'
import { exportBrandSheet } from '../lib/exportSheet.ts'
import { loadPalette, savePalette, type PaletteSave } from '../lib/projectStore.ts'
import {
  MAX_BLOCKS,
  MIN_BLOCKS,
  PANEL_STEPS,
  TOOLBAR_VERSIONS,
  canRedoState,
  canUndoState,
  docOf,
  isUnsaved,
  isVisible,
  layoutIsDefault,
  mergeLayout,
  selectedBlock,
  type WorkspaceAction,
  type WorkspaceState,
} from '../lib/workspaceState.ts'
import ColourPicker from './ColourPicker.tsx'
import ComponentsMenu from './ComponentsMenu.tsx'
import DocumentPreview from './DocumentPreview.tsx'
import ExportButton from './ExportButton.tsx'
import GenerateToolbar from './GenerateToolbar.tsx'
import GridWorkspace, { type WorkspaceItem } from './GridWorkspace.tsx'
import PaletteCanvas from './PaletteCanvas.tsx'
import RoleToolbar from './RoleToolbar.tsx'
import './PaletteWorkspace.css'

// True when the key press belongs to a text field, which has its own undo.
const inTextField = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

type Props = {
  projectId: string
  projectName: string
  // The workspace, and the one way to change it. Everything on this screen goes through `dispatch`, and so does
  // everything the AI does, so the two can do exactly the same things.
  state: WorkspaceState
  dispatch: (action: WorkspaceAction) => void
  // Reports where each item is drawn and how tall, so the AI can place one component relative to another.
  onResolved?: (resolved: Placement[], heights: Heights) => void
}

// The palette workspace: a canvas of colour blocks with the toolbars and panels that work on it, all of which can be
// dragged anywhere on the grid. "Save" saves the palette and the layout to the project.
export default function PaletteWorkspace({ projectId, projectName, state, dispatch, onResolved }: Props) {
  const [saved, setSaved] = useState<PaletteSave | null>(() => loadPalette(projectId))
  const [saveFailed, setSaveFailed] = useState(false)
  const [historyNote, setHistoryNote] = useState('')

  const doc = docOf(state)
  const { blocks } = doc
  const selected = selectedBlock(state)
  const activeId = selected.id
  const label = `Colour ${blocks.findIndex((block) => block.id === activeId) + 1}`

  const roles = useMemo(() => resolveRoles(docOf(state).blocks), [state])
  const fillCount = replaceableIds(blocks, activeId).length

  const undoStep = useCallback(() => {
    if (!canUndoState(state)) return
    dispatch({ type: 'undo' })
    setHistoryNote('Undone.')
  }, [state, dispatch])

  const redoStep = useCallback(() => {
    if (!canRedoState(state)) return
    dispatch({ type: 'redo' })
    setHistoryNote('Redone.')
  }, [state, dispatch])

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

  const unsaved = isUnsaved(doc, saved)

  const save = () => {
    const result = savePalette(projectId, { blocks, layout: doc.layout, sizes: doc.sizes, hidden: doc.hidden })
    setSaveFailed(result === null)
    if (result) setSaved(result)
  }

  const resize = useCallback((id: string, value: number) => dispatch({ type: 'resize', id, value }), [dispatch])
  const exportSheet = useCallback(() => exportBrandSheet(blocks, projectName), [blocks, projectName])

  const items: WorkspaceItem[] = useMemo(
    () => [
      {
        id: 'picker',
        title: 'Colour picker',
        icon: PaletteIcon,
        w: 8,
        radius: 'var(--radius-xl)',
        delay: 0.45,
        distance: 0.9,
        resize: { mode: 'variant', current: doc.sizes.picker ?? 0, labels: TOOLBAR_VERSIONS },
        node: (
          <ColourPicker
            size={doc.sizes.picker ?? 0}
            value={selected.hex}
            onChange={(hex) => dispatch({ type: 'set_hex', id: activeId, hex })}
            editing={label}
            reason={doc.reasons.picker ?? 'Shown because you asked for a colour palette. Click the colour to open the full spectrum.'}
          />
        ),
      },
      {
        id: 'role',
        title: 'Colour role',
        icon: TagIcon,
        w: 10,
        radius: 'var(--radius-xl)',
        delay: 0.9,
        distance: 0.4,
        resize: { mode: 'variant', current: doc.sizes.role ?? 0, labels: TOOLBAR_VERSIONS },
        node: (
          <RoleToolbar
            size={doc.sizes.role ?? 0}
            roles={roles}
            hex={selected.hex}
            editing={label}
            role={selected.role}
            onChange={(role: ColourRole | null) => dispatch({ type: 'set_role', id: activeId, role })}
            reason={doc.reasons.role ?? 'Says what the selected colour is for, so the preview and the brand sheet know which colour is the text.'}
          />
        ),
      },
      {
        id: 'generate',
        title: 'Generate',
        icon: MagicWand3Icon,
        w: 9,
        radius: 'var(--radius-xl)',
        delay: 1.1,
        distance: 0.7,
        resize: { mode: 'variant', current: doc.sizes.generate ?? 0, labels: TOOLBAR_VERSIONS },
        node: (
          <GenerateToolbar
            size={doc.sizes.generate ?? 0}
            fills={fillCount}
            keeps={blocks.length - fillCount}
            harmony={state.harmony}
            onHarmonyChange={(harmony) => dispatch({ type: 'set_harmony', harmony })}
            onGenerate={() => dispatch({ type: 'generate' })}
            canGenerate={fillCount > 0}
            from={label}
            reason={doc.reasons.generate ?? 'Suggests colours that go with the selected one. Keep a colour with its lock and Generate will leave it alone.'}
          />
        ),
      },
      {
        id: 'canvas',
        title: 'Palette canvas',
        icon: LayersMinimalisticIcon,
        w: 24,
        fill: true,
        radius: 'var(--radius-xl)',
        distance: 0.12,
        resize: { mode: 'columns', steps: PANEL_STEPS },
        node: (
          <div className="palette-workspace__canvas">
            <PaletteCanvas
              blocks={blocks}
              selectedId={activeId}
              max={MAX_BLOCKS}
              min={MIN_BLOCKS}
              onSelect={(id) => dispatch({ type: 'select', id })}
              onAdd={() => dispatch({ type: 'add_block' })}
              onRemove={(id) => dispatch({ type: 'remove_block', id })}
              onToggleLock={(id) => dispatch({ type: 'toggle_keep', id })}
              reason={doc.reasons.canvas ?? 'The colours you are choosing between. Select one to edit it.'}
            />
          </div>
        ),
      },
      {
        id: 'preview',
        title: 'Preview',
        icon: BillListIcon,
        w: 12,
        fill: true,
        radius: 'var(--radius-xl)',
        delay: 1.6,
        distance: 0.8,
        resize: { mode: 'columns', steps: PANEL_STEPS },
        node: (
          <div className="palette-workspace__canvas">
            <DocumentPreview
              roles={roles}
              businessName={doc.businessName}
              reason={doc.reasons.preview ?? 'Shows the palette on a real document, because swatches alone do not show how it will work.'}
            />
          </div>
        ),
      },
    ],
    [blocks, doc.sizes, doc.reasons, doc.businessName, selected, activeId, label, roles, state.harmony, fillCount, dispatch],
  )

  // Hidden components are off the grid, and keep their place in the layout for when they come back.
  const visibleItems = items.filter((item) => isVisible(doc, item.id))
  const visibleLayout = doc.layout.filter((placement) => isVisible(doc, placement.id))
  const changeVisibleLayout = (next: Placement[]) => dispatch({ type: 'layout', layout: mergeLayout(doc.layout, next) })

  return (
    <div className="palette-workspace">
      <div className="palette-workspace__toolbar">
        <p className="palette-workspace__status" role="status">
          {saveFailed ? 'Could not save in this browser.' : !saved ? '' : unsaved ? `Changes since you last saved to ${projectName} are not saved.` : `Saved to ${projectName}.`}
        </p>
        <div className="palette-workspace__actions">
          <div className="palette-workspace__history" role="group" aria-label="History">
            <button type="button" className="palette-workspace__icon-button" disabled={!canUndoState(state)} onClick={undoStep} aria-label="Undo">
              <UndoLeftIcon size={18} aria-hidden="true" />
            </button>
            <button type="button" className="palette-workspace__icon-button" disabled={!canRedoState(state)} onClick={redoStep} aria-label="Redo">
              <UndoRightIcon size={18} aria-hidden="true" />
            </button>
          </div>
          <ComponentsMenu
            hidden={doc.hidden}
            onShow={(component) => dispatch({ type: 'show', component })}
            onHide={(component) => dispatch({ type: 'hide', component })}
          />
          <button type="button" className="palette-workspace__button" disabled={layoutIsDefault(doc)} onClick={() => dispatch({ type: 'reset_layout' })}>
            <RestartIcon size={18} aria-hidden="true" />
            Reset layout
          </button>
          <button type="button" className="palette-workspace__button palette-workspace__button--primary" disabled={!unsaved} onClick={save}>
            {unsaved ? <DisketteIcon size={18} aria-hidden="true" /> : <CheckIcon size={18} aria-hidden="true" />}
            {unsaved ? 'Save' : 'Saved'}
          </button>
          <ExportButton onExport={exportSheet} />
        </div>
      </div>
      <p className="visually-hidden" role="status">
        {historyNote}
      </p>

      <GridWorkspace items={visibleItems} layout={visibleLayout} onLayoutChange={changeVisibleLayout} onResize={resize} onResolved={onResolved} />
    </div>
  )
}
