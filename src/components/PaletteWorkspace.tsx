import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { EyeIcon, PaletteIcon, TagIcon } from '@solar-icons/react/linear'
import type { Icon } from '@solar-icons/react/lib/types'
import { BRAND_PARTS, BRAND_TITLES, brandPartsDone, type BrandPartId } from '../lib/brandParts.ts'
import { NO_PICKS, advanceBrand, backBrand, brandBlockers, brandLead, brandStepIndex, goToBrand, paletteResultOf, type BrandProgress, type GuidePicks, type PaletteResult } from '../lib/brandGuide.ts'
import { useGuideCard } from '../hooks/useGuideCard.ts'
import { fixActions, makeMoreReadable } from '../lib/readability.ts'
import type { PaletteOption } from '../lib/paletteOptions.ts'
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
import GuideCard from './GuideCard.tsx'
import GuideColours from './GuideColours.tsx'
import GuideFooter from './GuideFooter.tsx'
import HarmonyCards from './HarmonyCards.tsx'
import PaletteCanvas from './PaletteCanvas.tsx'
import PartSection from './PartSection.tsx'
import RoleCards from './RoleCards.tsx'
import TaskBar, { type BarItem } from './TaskBar.tsx'
import WorkspaceShell, { type HeaderSlots } from './WorkspaceShell.tsx'

type Props = {
  // Workspace mode shows the three parts of the brand stacked in the panel; Guide mode shows one at a time, with Back and Continue. Everything else is the same.
  mode: 'guide' | 'workspace'
  projectId: string
  projectName: string
  // The workspace, and the one way to change it. Everything on this screen goes through `dispatch`, and so does
  // everything the AI does, so the two can do exactly the same things.
  state: WorkspaceState
  dispatch: (action: WorkspaceAction) => void
  // Where the founder is in the guide. Held by Home, so it outlasts a visit to another workspace, and a switch of mode.
  progress: BrandProgress
  onProgress: (progress: BrandProgress) => void
  // The palette is finished in Guide mode: saved and ready. Home closes the workspace and shows the result in the chat.
  onFinished: (result: PaletteResult) => void
  headerSlots?: HeaderSlots
}

const PART_ICONS: Record<BrandPartId, Icon> = { colours: PaletteIcon, roles: TagIcon, contrast: EyeIcon }

// The brand workspace: the palette and a sample document in your colours on the left, and the three parts of the brand (Colours, Roles, Contrast) on the right, in the
// frame every task shares. The parts are the same in both modes, with the same names and icons: Workspace mode stacks them all, Guide mode shows one at a time with
// Back and Continue under it, and Finish saves the palette. "Save" saves the palette too. In Guide mode the Colours part is a different way in (pick up to three
// colours you like, then choose one of three palettes built in code); the palette it sets is the same one the wheel edits.
export default function PaletteWorkspace({ mode, projectId, projectName, state, dispatch, progress, onProgress, onFinished, headerSlots }: Props) {
  // What was saved is read from storage, which takes a moment. Until it has arrived the bar says nothing and Save waits.
  const { value: saved, loaded, set: setSaved } = useLoaded<PaletteSave | null>(projectId, () => loadPalette(projectId), null)
  const [saveFailed, setSaveFailed] = useState(false)
  // The part the cursor is in is the one in view.
  const [looking, setLooking] = useState<BrandPartId>(BRAND_PARTS[0])
  const guided = mode === 'guide'
  const { step } = progress
  const index = brandStepIndex(step)
  const last = index === BRAND_PARTS.length - 1
  // What the founder has picked in the Colours step. Held here, so it outlasts a visit to another step.
  const [picks, setPicks] = useState<GuidePicks>(NO_PICKS)
  // What was missing when Continue was pressed. Each goes as soon as it is fixed.
  const [blocked, setBlocked] = useState<string[]>([])
  const [finishNote, setFinishNote] = useState('')
  const [finishing, setFinishing] = useState(false)
  const { cardRef, markMoved, focusProblem } = useGuideCard()

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

  const hasSaved = loaded && saved !== null
  const facts = { blocks, hasSaved }
  const stillBlocked = blocked.filter((text) => brandBlockers(step, facts).includes(text))

  const move = (next: BrandProgress) => {
    if (next === progress) return
    markMoved()
    setBlocked([])
    setFinishNote('')
    onProgress(next)
  }

  const next = () => {
    const result = advanceBrand(progress, facts)
    if (result.blocked.length > 0) {
      setBlocked(result.blocked)
      focusProblem()
    } else move(result.progress)
  }

  // Finish saves the palette with the plain save (the palette has no confirm note), then Home closes the workspace and shows the result in the chat. A palette that
  // was saved and has not changed since is finished as it is.
  const finish = async () => {
    // Until what was saved has been read, there is nothing to judge a save against.
    if (finishing || !loaded) return
    setFinishNote('')
    if (unsaved) {
      setFinishing(true)
      const result = await savePalette(projectId, { blocks })
      setFinishing(false)
      setSaveFailed(result === null)
      if (!result) return setFinishNote('I could not save the palette, because it could not be stored. Try again.')
      setSaved(result)
    }
    onFinished(paletteResultOf(blocks))
  }

  // Workspace mode: a press on a part scrolls to it. Guide mode: it goes back to a part already reached.
  const goTo = (id: BrandPartId) => {
    if (guided) return move(goToBrand(progress, id))
    setLooking(id)
    scrollToPart(id)
  }
  const noteFocus = (event: { target: EventTarget }) => {
    const id = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-part]')?.dataset.part : undefined
    if (id && (BRAND_PARTS as readonly string[]).includes(id)) setLooking(id as BrandPartId)
  }

  // Choosing a palette sets the colours in one undo step.
  const choose = (option: PaletteOption) => dispatch({ type: 'set_palette', blocks: option.blocks })

  // Moves the text (or the background) until the text reads at AA, as one undo step, and says what it did.
  const makeReadable = () => {
    const fix = makeMoreReadable(blocks)
    if (!fix) return null
    dispatch({ type: 'batch', actions: fixActions(blocks, fix) })
    return `Moved the ${fix.moved} colour from ${fix.from} to ${fix.to}, so the text now reads at ${fix.ratio.toFixed(1)} to 1.`
  }

  const bar: BarItem[] = BRAND_PARTS.map((id) => ({
    id,
    title: BRAND_TITLES[id],
    label: BRAND_TITLES[id],
    reason: brandLead(id, guided),
    icon: PART_ICONS[id],
    done: done[id],
    current: guided ? (id === step ? 'step' : undefined) : id === looking ? 'location' : undefined,
    // In Guide mode a part further on than the founder has got cannot be skipped to.
    locked: guided && BRAND_PARTS.indexOf(id) > progress.reached,
    onSelect: () => goTo(id),
  }))

  const number = (blockId: number) => blocks.findIndex((block) => block.id === blockId) + 1

  const parts: Record<BrandPartId, ReactNode> = {
    colours: guided ? (
      <GuideColours picks={picks} onPicks={setPicks} blocks={blocks} showsSaved={hasSaved && !unsaved} onChoose={choose} />
    ) : (
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
    contrast: <ContrastPart roles={roles} onMakeReadable={guided ? makeReadable : undefined} />,
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

  const section = (id: BrandPartId) => (
    <PartSection key={id} id={id} title={BRAND_TITLES[id]} lead={brandLead(id, guided)}>
      {parts[id]}
    </PartSection>
  )

  const panel = guided ? (
    <GuideCard stepKey={step} cardRef={cardRef} position={index + 1} of={BRAND_PARTS.length}>
      {section(step)}
    </GuideCard>
  ) : (
    <div className="frame__parts" onFocusCapture={noteFocus}>
      {BRAND_PARTS.map(section)}
    </div>
  )

  const footer = guided && (
    <GuideFooter canBack={index > 0} onBack={() => move(backBrand(progress))} last={last} onNext={next} onFinish={() => void finish()} missing={stillBlocked} note={finishNote} disabled={finishing} />
  )

  return (
    <>
      <WorkspaceShell
        bar={<TaskBar kind="parts" label="Parts of the brand" items={bar} />}
        thing={thing}
        thingLabel="The palette"
        panel={panel}
        panelLabel={guided ? `Step ${index + 1} of ${BRAND_PARTS.length}: ${BRAND_TITLES[step]}` : 'The parts of the brand'}
        footer={footer}
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
      {guided && (
        <p className="visually-hidden" role="status">
          {`Step ${index + 1} of ${BRAND_PARTS.length}: ${BRAND_TITLES[step]}.`}
        </p>
      )}
    </>
  )
}
