import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { EyeIcon, GalleryIcon, PaletteIcon, Palette2Icon, TagIcon } from '@solar-icons/react/linear'
import type { Icon } from '@solar-icons/react/lib/types'
import { BRAND_PARTS, BRAND_TITLES, brandPartsDone, type BrandPartId } from '../lib/brandParts.ts'
import { NO_PICKS, advanceBrand, backBrand, brandBlockers, brandLead, brandStepIndex, goToBrand, paletteResultOf, type BrandProgress, type GuidePicks, type PaletteResult } from '../lib/brandGuide.ts'
import { useGuideCard } from '../hooks/useGuideCard.ts'
import { fixActions, makeMoreReadable } from '../lib/readability.ts'
import type { PaletteOption } from '../lib/paletteOptions.ts'
import { harmonyLabel, isRule, type Harmony } from '../lib/harmony.ts'
import { COLOUR_ROLES, resolveRoles, type ColourRole, type PaletteBlock } from '../lib/palette.ts'
import { DEFAULT_PALETTE_NAME, checkPaletteName, nameOfBlocks, sameName, upsertNamed, type NamedPalette } from '../lib/namedPalettes.ts'
import { readableRandomPalette, baseTarget } from '../lib/randomPalette.ts'
import { exportBrandSheet } from '../lib/exportSheet.ts'
import { useLoaded } from '../hooks/useLoaded.ts'
import { forgetNamedPalette, loadPalette, markPaletteExported, savePalette, type PaletteSave } from '../lib/projectStore.ts'
import { MAX_BLOCKS, MIN_BLOCKS, canRedoState, canUndoState, docOf, isUnsaved, selectedBlock, type WorkspaceAction, type WorkspaceState } from '../lib/workspaceState.ts'
import BrandToolbar from './BrandToolbar.tsx'
import { ColourFields, RoleChoice } from './ColourFields.tsx'
import ColourWheel from './ColourWheel.tsx'
import ContrastLines from './ContrastLines.tsx'
import DocumentPreview from './DocumentPreview.tsx'
import ExportButton from './ExportButton.tsx'
import GuideCard from './GuideCard.tsx'
import GuideColours from './GuideColours.tsx'
import GuideFooter from './GuideFooter.tsx'
import HarmonyRow from './HarmonyRow.tsx'
import ImageSource from './ImageSource.tsx'
import PartSection from './PartSection.tsx'
import RoleList from './RoleList.tsx'
import SourceTabs, { type SourceTab } from './SourceTabs.tsx'
import SpectrumPicker from './SpectrumPicker.tsx'
import SwatchStrip from './SwatchStrip.tsx'
import TaskBar, { type BarItem } from './TaskBar.tsx'
import WorkspaceShell, { type HeaderSlots } from './WorkspaceShell.tsx'
import './PaletteWorkspace.css'

type Props = {
  // Workspace mode shows the colour tools together on the left; Guide mode shows one part at a time, with Back and Continue. The palette and the toolbar are the same.
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
  // The brand puts nothing in the header's slots: its controls are in its own toolbar. Only the task bar (the guide's stepper) uses the shelf.
  headerSlots?: HeaderSlots
}

const PART_ICONS: Record<BrandPartId, Icon> = { colours: PaletteIcon, roles: TagIcon, contrast: EyeIcon }

type Source = 'base' | 'image' | 'wheel'
const SOURCES: SourceTab<Source>[] = [
  { id: 'base', label: 'Base colour', icon: Palette2Icon },
  { id: 'image', label: 'Image', icon: GalleryIcon },
  { id: 'wheel', label: 'Colour wheel', icon: PaletteIcon },
]

// The brand workspace. A toolbar of pills across the top (Download, Save, the palette's name, Saved palettes; Undo, Redo, Generate random, Full screen). Below it the
// tools on the left and the palette on the right: the tools are three ways to choose colours (a base colour, a picture, the colour wheel with its harmonies) and,
// under them, the selected colour's exact value and role; the palette is tall pills with their hex codes, the contrast of the key pairs and a sample document in
// the colours. Nothing is boxed. In Guide mode the left is one part at a time (Colours, Roles, Contrast) with Back and Continue under it, and the task bar under the
// header is the stepper. Save keeps the palette as the working palette and under its name, so it can be opened later from Saved palettes or the library.
export default function PaletteWorkspace({ mode, projectId, projectName, state, dispatch, progress, onProgress, onFinished, headerSlots }: Props) {
  // What was saved is read from storage, which takes a moment. Until it has arrived the toolbar says nothing and Save waits.
  const { value: saved, loaded, set: setSaved } = useLoaded<PaletteSave | null>(projectId, () => loadPalette(projectId), null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [saveNote, setSaveNote] = useState('')
  // Why a save could not be done (twenty palettes are kept already), shown as a problem and not as a status.
  const [saveProblem, setSaveProblem] = useState<string | null>(null)
  const [name, setName] = useState(DEFAULT_PALETTE_NAME)
  const [source, setSource] = useState<Source>('wheel')
  const [fullscreen, setFullscreen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const guided = mode === 'guide'
  const { step } = progress
  const index = brandStepIndex(step)
  const last = index === BRAND_PARTS.length - 1
  const tabsId = useId()
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
  const activeNumber = blocks.findIndex((block) => block.id === activeId) + 1
  const harmony = state.harmony

  const roles = useMemo(() => resolveRoles(blocks), [blocks])
  const done = useMemo(() => brandPartsDone(blocks), [blocks])
  const palettes: NamedPalette[] = useMemo(() => saved?.palettes ?? [], [saved])

  // The name follows the colours: when the palette on screen is exactly a palette that was kept (read from storage, opened from the list or the library, or got back
  // by undo), the name field shows that palette's name. It changes only when the colours do, so a name being typed is not taken away.
  const named = useRef<{ blocks: PaletteBlock[]; loaded: boolean } | null>(null)
  useEffect(() => {
    if (!loaded) return
    const before = named.current
    if (before && before.loaded && before.blocks === blocks) return
    named.current = { blocks, loaded }
    const match = nameOfBlocks(palettes, blocks)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (match) setName(match)
  }, [loaded, blocks, palettes])

  const checkedName = checkPaletteName(name)
  const nameProblem = checkedName.ok ? null : checkedName.reason
  // The name the saved working palette was kept under, if it was.
  const savedName = saved ? nameOfBlocks(saved.palettes ?? [], saved.blocks) : null
  const nameChanged = loaded && saved !== null && savedName !== null && !sameName(name, savedName)
  const unsaved = loaded && (isUnsaved(doc, saved) || nameChanged)

  const save = async () => {
    if (!loaded || !checkedName.ok) return
    const kept = upsertNamed(palettes, { name: checkedName.name, blocks })
    if (!kept.ok) {
      setSaveFailed(false)
      setSaveProblem(kept.reason)
      return
    }
    setSaveProblem(null)
    const result = await savePalette(projectId, { blocks, palettes: kept.list })
    setSaveFailed(result === null)
    if (!result) return
    setSaved(result)
    setName(checkedName.name)
    setSaveNote(kept.replaced ? `Saved. This replaced the palette you had kept as “${checkedName.name}”.` : `Saved as “${checkedName.name}”.`)
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

  // A short line under the toolbar. Nothing is saved until the founder saves.
  const status = !loaded ? '' : saveFailed ? 'Could not save' : unsaved ? (!saved ? 'Not saved yet' : 'Unsaved changes') : saveNote || (saved ? 'All changes saved' : 'Not saved yet')

  const openPalette = (palette: NamedPalette) => {
    dispatch({ type: 'set_palette', blocks: palette.blocks })
    setName(palette.name)
    setSaveNote('')
    setAnnouncement(`Opened ${palette.name}. Undo takes you back.`)
  }

  const forgetPalette = async (palette: NamedPalette) => {
    const forgot = await forgetNamedPalette(projectId, palette.id)
    if (forgot) setSaved(await loadPalette(projectId))
    setAnnouncement(forgot ? `Forgot ${palette.name}.` : `Could not forget ${palette.name}.`)
  }

  const generateRandom = () => {
    const action = readableRandomPalette(state)
    if (action) {
      dispatch(action)
      setAnnouncement('A new random palette. Undo takes you back.')
    }
  }

  const toggleFullscreen = () => {
    setAnnouncement(fullscreen ? 'Full screen off. The tools are back.' : 'Full screen on. The tools are hidden. Press Escape to go back.')
    setFullscreen(!fullscreen)
  }
  useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      // A popover or panel that is open closes first.
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[data-layer]')) return
      setFullscreen(false)
      setAnnouncement('Full screen off. The tools are back.')
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [fullscreen])

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
  // was saved and has not changed since is finished as it is. The palettes the founder named are kept as they are.
  const finish = async () => {
    // Until what was saved has been read, there is nothing to judge a save against.
    if (finishing || !loaded) return
    setFinishNote('')
    if (isUnsaved(doc, saved)) {
      setFinishing(true)
      const result = await savePalette(projectId, { blocks })
      setFinishing(false)
      setSaveFailed(result === null)
      if (!result) return setFinishNote('I could not save the palette, because it could not be stored. Try again.')
      setSaved(result)
    }
    onFinished(paletteResultOf(blocks))
  }

  // In Guide mode a part already reached can be gone back to.
  const goTo = (id: BrandPartId) => move(goToBrand(progress, id))

  // Choosing a palette sets the colours in one undo step.
  const choose = (option: PaletteOption) => dispatch({ type: 'set_palette', blocks: option.blocks })

  // Moves the text (or the background) until the text reads at AA, as one undo step, and says what it did.
  const makeReadable = () => {
    const fix = makeMoreReadable(blocks)
    if (!fix) return null
    dispatch({ type: 'batch', actions: fixActions(blocks, fix) })
    return `Moved the ${fix.moved} colour from ${fix.from} to ${fix.to}, so the text now reads at ${fix.ratio.toFixed(1)} to 1.`
  }

  // Any change to the colour being worked on. With a harmony chosen the others follow it by the rule (a colour that is kept stays); in Custom it moves alone.
  const moveColour = (id: number, hex: string) => dispatch({ type: 'set_base', id, hex })
  const chooseHarmony = (rule: Harmony) => {
    dispatch({ type: 'use_harmony', harmony: rule })
    setAnnouncement(isRule(rule) ? `${harmonyLabel(rule)} chosen. The colours that are not kept now follow the selected colour. Undo takes you back.` : 'Custom: each colour moves on its own.')
  }
  const takeColours = (colours: string[]) => {
    dispatch({ type: 'set_palette', blocks: colours.slice(0, MAX_BLOCKS).map((hex, position) => ({ id: position + 1, hex })) })
    setAnnouncement(`The palette is now the ${colours.length} colours from your picture. Undo takes you back.`)
  }

  const bar: BarItem[] = BRAND_PARTS.map((id) => ({
    id,
    title: BRAND_TITLES[id],
    label: BRAND_TITLES[id],
    reason: brandLead(id, guided),
    icon: PART_ICONS[id],
    done: done[id],
    current: id === step ? 'step' : undefined,
    // A part further on than the founder has got cannot be skipped to.
    locked: BRAND_PARTS.indexOf(id) > progress.reached,
    onSelect: () => goTo(id),
  }))

  // ---- The tools on the left ----

  const holds = COLOUR_ROLES.find((role) => roles[role.id].blockId === activeId && !roles[role.id].chosen)?.id ?? null

  const workspaceTools = (
    <div className="brandtools" data-part="colours" tabIndex={-1}>
      <SourceTabs tabs={SOURCES} value={source} onChange={setSource} label="Where the colours come from" idBase={tabsId} />
      <div role="tabpanel" id={`${tabsId}-panel-${source}`} aria-labelledby={`${tabsId}-tab-${source}`} className="brandtools__panel">
        {source === 'base' && <SpectrumPicker hex={selected.hex} label={`colour ${activeNumber}`} onChange={(hex) => moveColour(activeId, hex)} />}
        {source === 'image' && <ImageSource onUse={takeColours} />}
        {source === 'wheel' && (
          <>
            <ColourWheel blocks={blocks} selectedId={activeId} onSelect={(id) => dispatch({ type: 'select', id })} onChange={moveColour} showRule={isRule(harmony)} />
            <HarmonyRow harmony={harmony} onChoose={chooseHarmony} />
          </>
        )}
      </div>
      <section className="brandtools__selected" aria-label={`Colour ${activeNumber}`}>
        <h3 className="brandtools__heading">{`Colour ${activeNumber}`}</h3>
        <ColourFields key={activeId} hex={selected.hex} number={activeNumber} onChange={(hex) => moveColour(activeId, hex)} />
        <RoleChoice number={activeNumber} role={selected.role} suggested={holds} onChange={(role: ColourRole | null) => dispatch({ type: 'set_role', id: activeId, role })} />
      </section>
    </div>
  )

  const section = (id: BrandPartId, children: ReactNode) => (
    <PartSection key={id} id={id} title={BRAND_TITLES[id]} lead={brandLead(id, guided)} plain>
      {children}
    </PartSection>
  )

  const guideStep =
    step === 'colours'
      ? section('colours', <GuideColours picks={picks} onPicks={setPicks} blocks={blocks} showsSaved={hasSaved && !isUnsaved(doc, saved)} onChoose={choose} />)
      : step === 'roles'
        ? section('roles', <RoleList blocks={blocks} roles={roles} onChange={(id, role) => dispatch({ type: 'set_role', id, role })} />)
        : section('contrast', <ContrastLines bare roles={roles} onMakeReadable={makeReadable} />)

  const panel = guided ? (
    <GuideCard stepKey={step} cardRef={cardRef} position={index + 1} of={BRAND_PARTS.length}>
      {guideStep}
    </GuideCard>
  ) : (
    workspaceTools
  )

  const footer = guided && (
    <GuideFooter canBack={index > 0} onBack={() => move(backBrand(progress))} last={last} onNext={next} onFinish={() => void finish()} missing={stillBlocked} note={finishNote} disabled={finishing} />
  )

  // ---- The palette on the right ----

  const thing = (
    <div className="brandview">
      <SwatchStrip
        blocks={blocks}
        roles={roles}
        selectedId={activeId}
        max={MAX_BLOCKS}
        min={MIN_BLOCKS}
        onSelect={(id) => dispatch({ type: 'select', id })}
        onAdd={() => dispatch({ type: 'add_block' })}
        onRemove={(id) => dispatch({ type: 'remove_block', id })}
        onToggleLock={(id) => dispatch({ type: 'toggle_keep', id })}
        onToggleStar={(id) => dispatch({ type: 'toggle_star', id })}
      />
      {/* In the Contrast step the pairs are on the left with the fix, so they are not drawn twice. */}
      {!(guided && step === 'contrast') && <ContrastLines roles={roles} />}
      <DocumentPreview roles={roles} businessName={doc.businessName} reason={doc.reasons.canvas ?? 'Shows the palette on a real document, because swatches alone do not show how it will work.'} />
    </div>
  )

  return (
    <>
      <WorkspaceShell
        bar={guided && !fullscreen ? <TaskBar kind="parts" label="Parts of the brand" items={bar} /> : undefined}
        toolbar={(history) => (
          <BrandToolbar
            history={history}
            download={<ExportButton iconOnly ariaLabel="Download brand sheet" onExport={exportSheet} />}
            name={name}
            onName={(value) => {
              setName(value)
              setSaveNote('')
              setSaveProblem(null)
            }}
            nameProblem={nameProblem ?? saveProblem}
            canSave={loaded}
            unsaved={unsaved}
            onSave={() => void save()}
            status={status}
            palettes={palettes}
            onOpenPalette={openPalette}
            onForgetPalette={(palette) => void forgetPalette(palette)}
            canRandom={baseTarget(blocks, activeId) !== null}
            onRandom={generateRandom}
            fullscreen={fullscreen}
            onFullscreen={toggleFullscreen}
          />
        )}
        swap
        hidePanel={fullscreen}
        thing={thing}
        thingLabel="The palette"
        panel={panel}
        panelLabel={guided ? `Step ${index + 1} of ${BRAND_PARTS.length}: ${BRAND_TITLES[step]}` : 'The colour tools'}
        footer={footer}
        canUndo={canUndoState(state)}
        canRedo={canRedoState(state)}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        headerSlots={headerSlots}
      />
      <p className="visually-hidden" role="status">
        {announcement}
      </p>
      {guided && (
        <p className="visually-hidden" role="status">
          {`Step ${index + 1} of ${BRAND_PARTS.length}: ${BRAND_TITLES[step]}.`}
        </p>
      )}
    </>
  )
}
