import { useCallback, useMemo, useState } from 'react'
import { MagicWand3Icon, PaletteIcon, TagIcon } from '@solar-icons/react/linear'
import { replaceableIds } from '../lib/harmony.ts'
import { resolveRoles, type ColourRole } from '../lib/palette.ts'
import { exportBrandSheet } from '../lib/exportSheet.ts'
import { useLoaded } from '../hooks/useLoaded.ts'
import { loadPalette, markPaletteExported, savePalette, type PaletteSave } from '../lib/projectStore.ts'
import {
  MAX_BLOCKS,
  MIN_BLOCKS,
  PALETTE_SPEC,
  PANEL_MIN_COLS,
  WINDOW_SIZES,
  canRedoState,
  canUndoState,
  docOf,
  isUnsaved,
  selectedBlock,
  type WorkspaceAction,
  type WorkspaceState,
} from '../lib/workspaceState.ts'
import ColourPicker from './ColourPicker.tsx'
import ColourWheelWindow from './ColourWheelWindow.tsx'
import DocumentPreview from './DocumentPreview.tsx'
import ExportButton from './ExportButton.tsx'
import GenerateToolbar from './GenerateToolbar.tsx'
import GenerateWindow from './GenerateWindow.tsx'
import type { WorkspaceItem } from './GridWorkspace.tsx'
import PaletteCanvas from './PaletteCanvas.tsx'
import RoleToolbar from './RoleToolbar.tsx'
import RoleWindow from './RoleWindow.tsx'
import type { ShelfTool } from './ToolShelf.tsx'
import WorkspaceShell, { type HeaderSlots } from './WorkspaceShell.tsx'

type Props = {
  projectId: string
  projectName: string
  // The workspace, and the one way to change it. Everything on this screen goes through `dispatch`, and so does
  // everything the AI does, so the two can do exactly the same things.
  state: WorkspaceState
  dispatch: (action: WorkspaceAction) => void
  headerSlots?: HeaderSlots
}

// The palette workspace: tools for the colours in the toolbar and windows (the palette canvas, the document preview), on
// the shared workspace shell. "Save" saves the palette, the tools and the layout.
export default function PaletteWorkspace({ projectId, projectName, state, dispatch, headerSlots }: Props) {
  // What was saved is read from storage, which takes a moment. Until it has arrived the bar says nothing and Save waits.
  const { value: saved, loaded, set: setSaved } = useLoaded<PaletteSave | null>(projectId, () => loadPalette(projectId), null)
  const [saveFailed, setSaveFailed] = useState(false)

  const doc = docOf(state)
  const { blocks } = doc
  const selected = selectedBlock(state)
  const activeId = selected.id
  const label = `Colour ${blocks.findIndex((block) => block.id === activeId) + 1}`

  const roles = useMemo(() => resolveRoles(docOf(state).blocks), [state])
  const fillCount = replaceableIds(blocks, activeId).length

  const unsaved = loaded && isUnsaved(doc, saved)

  const save = async () => {
    const result = await savePalette(projectId, { blocks, layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden })
    setSaveFailed(result === null)
    if (result) setSaved(result)
  }

  // A palette that was saved and has not changed is marked as exported, so the library says so. One with unsaved changes is not: what was exported is
  // not what is saved.
  const exportSheet = useCallback(async () => {
    const exported = await exportBrandSheet(blocks, projectName)
    if (exported && saved && !isUnsaved(doc, saved)) {
      const marked = await markPaletteExported(projectId)
      if (marked) setSaved(marked)
    }
    return exported
    // doc is read for what is saved only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, projectName, projectId, saved, state])

  // The tools, each a segment of the toolbar. The reason is shown from the tool's icon.
  const tools: Record<string, ShelfTool> = useMemo(
    () => ({
      picker: {
        id: 'picker',
        title: 'Colour picker',
        icon: PaletteIcon,
        reason: doc.reasons.picker ?? 'Shown because you asked for a colour palette. Click the colour to open the full spectrum.',
        node: (
          <ColourPicker
            value={selected.hex}
            onChange={(hex) => dispatch({ type: 'set_hex', id: activeId, hex })}
            editing={label}
          />
        ),
      },
      role: {
        id: 'role',
        title: 'Colour role',
        icon: TagIcon,
        reason: doc.reasons.role ?? 'Says what the selected colour is for, so the preview and the brand sheet know which colour is the text.',
        node: (
          <RoleToolbar
            hex={selected.hex}
            editing={label}
            role={selected.role}
            onChange={(role: ColourRole | null) => dispatch({ type: 'set_role', id: activeId, role })}
          />
        ),
      },
      generate: {
        id: 'generate',
        title: 'Generate',
        icon: MagicWand3Icon,
        reason: doc.reasons.generate ?? 'Suggests colours that go with the selected one. Keep a colour with its lock and Generate will leave it alone.',
        node: (
          <GenerateToolbar
            harmony={state.harmony}
            onHarmonyChange={(harmony) => dispatch({ type: 'set_harmony', harmony })}
            onGenerate={() => dispatch({ type: 'generate' })}
            canGenerate={fillCount > 0}
            from={label}
          />
        ),
      },
    }),
    [doc.reasons, selected, activeId, label, state.harmony, fillCount, dispatch],
  )
  // The windows on the grid.
  const items: WorkspaceItem[] = useMemo(
    () => [
      {
        id: 'canvas',
        title: 'Palette canvas',
        w: WINDOW_SIZES.canvas.w,
        minCols: PANEL_MIN_COLS,
        distance: 0.12,
        node: (
          <div className="workspace__card">
            <PaletteCanvas
              blocks={blocks}
              selectedId={activeId}
              max={MAX_BLOCKS}
              min={MIN_BLOCKS}
              onSelect={(id) => dispatch({ type: 'select', id })}
              onAdd={() => dispatch({ type: 'add_block' })}
              onRemove={(id) => dispatch({ type: 'remove_block', id })}
              onToggleLock={(id) => dispatch({ type: 'toggle_keep', id })}
              onToggleStar={(id) => dispatch({ type: 'toggle_star', id })}
              reason={doc.reasons.canvas ?? 'The colours you are choosing between. Select one to edit it.'}
            />
          </div>
        ),
      },
      {
        id: 'preview',
        title: 'Preview',
        w: WINDOW_SIZES.preview.w,
        minCols: PANEL_MIN_COLS,
        delay: 0.6,
        distance: 0.8,
        node: (
          <div className="workspace__card">
            <DocumentPreview
              roles={roles}
              businessName={doc.businessName}
              reason={doc.reasons.preview ?? 'Shows the palette on a real document, because swatches alone do not show how it will work.'}
            />
          </div>
        ),
      },
      // The tools, as the bigger windows they become when dragged out of the toolbar.
      {
        id: 'picker',
        title: 'Colour wheel',
        tool: true,
        w: WINDOW_SIZES.picker.w,
        minCols: 8,
        distance: 0.3,
        node: (
          <div className="workspace__card">
            <ColourWheelWindow
              blocks={blocks}
              selectedId={activeId}
              onSelect={(id) => dispatch({ type: 'select', id })}
              onChange={(id, hex) => dispatch({ type: 'set_hex', id, hex })}
              reason={doc.reasons.picker ?? 'The colour picker made big: every colour in the palette on one wheel. Drag a colour to change it.'}
            />
          </div>
        ),
      },
      {
        id: 'role',
        title: 'Colour roles',
        tool: true,
        w: WINDOW_SIZES.role.w,
        minCols: PANEL_MIN_COLS,
        distance: 0.3,
        node: (
          <div className="workspace__card">
            <RoleWindow
              roles={roles}
              selected={{ number: blocks.findIndex((block) => block.id === activeId) + 1, hex: selected.hex, role: selected.role }}
              numberOf={(blockId) => blocks.findIndex((block) => block.id === blockId) + 1}
              onChange={(role: ColourRole | null) => dispatch({ type: 'set_role', id: activeId, role })}
              onSelect={(id) => dispatch({ type: 'select', id })}
              reason={doc.reasons.role ?? 'The role tool made big: every role and the colour that holds it.'}
            />
          </div>
        ),
      },
      {
        id: 'generate',
        title: 'Harmonies',
        tool: true,
        w: WINDOW_SIZES.generate.w,
        minCols: PANEL_MIN_COLS,
        distance: 0.3,
        node: (
          <div className="workspace__card">
            <GenerateWindow
              blocks={blocks}
              selectedId={activeId}
              harmony={state.harmony}
              variation={state.variation}
              canGenerate={fillCount > 0}
              onHarmonyChange={(harmony) => dispatch({ type: 'set_harmony', harmony })}
              onGenerate={() => dispatch({ type: 'generate' })}
              reason={doc.reasons.generate ?? 'The generate tool made big: each harmony with a preview of the palette it would make.'}
            />
          </div>
        ),
      },
    ],
    [blocks, doc.reasons, doc.businessName, activeId, selected, roles, state.harmony, state.variation, fillCount, dispatch],
  )

  const windowsById = useMemo(() => Object.fromEntries(items.map((item) => [item.id, item])), [items])

  // A short word beside the Save button. Nothing is saved until the founder saves.
  const saveStatus = !loaded ? '' : saveFailed ? 'Could not save' : !saved ? 'Not saved yet' : unsaved ? 'Unsaved changes' : 'All changes saved'

  return (
    <WorkspaceShell
      spec={PALETTE_SPEC}
      arrangement={doc}
      dispatch={dispatch}
      tools={tools}
      windows={windowsById}
      canUndo={canUndoState(state)}
      canRedo={canRedoState(state)}
      onUndo={() => dispatch({ type: 'undo' })}
      onRedo={() => dispatch({ type: 'redo' })}
      saveStatus={saveStatus}
      unsaved={unsaved}
      onSave={save}
      exportButton={<ExportButton onExport={exportSheet} />}
      headerSlots={headerSlots}
    />
  )
}
