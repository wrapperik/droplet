import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { EyeIcon, PaletteIcon, TagIcon } from '@solar-icons/react/linear'
import type { Icon } from '@solar-icons/react/lib/types'
import { BRAND_LEADS, BRAND_PARTS, BRAND_TITLES, brandPartsDone, type BrandPartId } from '../lib/brandParts.ts'
import { replaceableIds } from '../lib/harmony.ts'
import { resolveRoles, type ColourRole } from '../lib/palette.ts'
import { exportBrandSheet } from '../lib/exportSheet.ts'
import { useLoaded } from '../hooks/useLoaded.ts'
import { scrollToPart } from '../lib/partNav.ts'
import { loadPalette, markPaletteExported, savePalette, type PaletteSave } from '../lib/projectStore.ts'
import { MAX_BLOCKS, MIN_BLOCKS, canRedoState, canUndoState, docOf, isUnsaved, selectedBlock, type WorkspaceAction, type WorkspaceState } from '../lib/workspaceState.ts'
import ColourWheel from './ColourWheel.tsx'
import ContrastPart from './ContrastPart.tsx'
import DocumentPreview from './DocumentPreview.tsx'
import ExportButton from './ExportButton.tsx'
import HarmonyCards from './HarmonyCards.tsx'
import PaletteCanvas from './PaletteCanvas.tsx'
import PartSection from './PartSection.tsx'
import RoleCards from './RoleCards.tsx'
import TaskBar, { type BarItem } from './TaskBar.tsx'
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

const PART_ICONS: Record<BrandPartId, Icon> = { colours: PaletteIcon, roles: TagIcon, contrast: EyeIcon }

// The brand workspace: the palette and a sample document in your colours on the left, and the three parts of the brand (Colours, Roles, Contrast) on the right,
// all at once, in the frame every task shares. "Save" saves the palette. Guide mode will show the same three parts one at a time; for now the brand opens this
// way in both modes.
export default function PaletteWorkspace({ projectId, projectName, state, dispatch, headerSlots }: Props) {
  // What was saved is read from storage, which takes a moment. Until it has arrived the bar says nothing and Save waits.
  const { value: saved, loaded, set: setSaved } = useLoaded<PaletteSave | null>(projectId, () => loadPalette(projectId), null)
  const [saveFailed, setSaveFailed] = useState(false)
  // The part the cursor is in is the one in view.
  const [looking, setLooking] = useState<BrandPartId>(BRAND_PARTS[0])

  const doc = docOf(state)
  const { blocks } = doc
  const selected = selectedBlock(state)
  const activeId = selected.id

  const roles = useMemo(() => resolveRoles(blocks), [blocks])
  const fillCount = replaceableIds(blocks, activeId).length
  const done = useMemo(() => brandPartsDone(blocks), [blocks])

  const unsaved = loaded && isUnsaved(doc, saved)

  const save = async () => {
    const result = await savePalette(projectId, { blocks })
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

  // A short word beside the Save button. Nothing is saved until the founder saves.
  const saveStatus = !loaded ? '' : saveFailed ? 'Could not save' : !saved ? 'Not saved yet' : unsaved ? 'Unsaved changes' : 'All changes saved'

  const goTo = (id: BrandPartId) => {
    setLooking(id)
    scrollToPart(id)
  }
  const noteFocus = (event: { target: EventTarget }) => {
    const id = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-part]')?.dataset.part : undefined
    if (id && (BRAND_PARTS as readonly string[]).includes(id)) setLooking(id as BrandPartId)
  }

  const bar: BarItem[] = BRAND_PARTS.map((id) => ({
    id,
    title: BRAND_TITLES[id],
    label: BRAND_TITLES[id],
    reason: BRAND_LEADS[id],
    icon: PART_ICONS[id],
    done: done[id],
    current: id === looking ? 'location' : undefined,
    onSelect: () => goTo(id),
  }))

  const number = (blockId: number) => blocks.findIndex((block) => block.id === blockId) + 1

  const parts: Record<BrandPartId, ReactNode> = {
    colours: (
      <>
        <ColourWheel
          blocks={blocks}
          selectedId={activeId}
          onSelect={(id) => dispatch({ type: 'select', id })}
          onChange={(id, hex) => dispatch({ type: 'set_hex', id, hex })}
        />
        <HarmonyCards
          blocks={blocks}
          selectedId={activeId}
          harmony={state.harmony}
          variation={state.variation}
          canGenerate={fillCount > 0}
          onHarmonyChange={(harmony) => dispatch({ type: 'set_harmony', harmony })}
          onGenerate={() => dispatch({ type: 'generate' })}
        />
      </>
    ),
    roles: (
      <RoleCards
        roles={roles}
        selected={{ number: number(activeId), hex: selected.hex, role: selected.role }}
        numberOf={number}
        onChange={(role: ColourRole | null) => dispatch({ type: 'set_role', id: activeId, role })}
        onSelect={(id) => dispatch({ type: 'select', id })}
      />
    ),
    contrast: <ContrastPart roles={roles} />,
  }

  const thing = (
    <>
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
      <div className="workspace__card">
        <DocumentPreview roles={roles} businessName={doc.businessName} reason="Shows the palette on a real document, because swatches alone do not show how it will work." />
      </div>
    </>
  )

  const panel = (
    <div className="frame__parts" onFocusCapture={noteFocus}>
      {BRAND_PARTS.map((id) => (
        <PartSection key={id} id={id} title={BRAND_TITLES[id]} lead={BRAND_LEADS[id]}>
          {parts[id]}
        </PartSection>
      ))}
    </div>
  )

  return (
    <WorkspaceShell
      bar={<TaskBar kind="parts" label="Parts of the brand" items={bar} />}
      thing={thing}
      thingLabel="The palette"
      panel={panel}
      panelLabel="The parts of the brand"
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
