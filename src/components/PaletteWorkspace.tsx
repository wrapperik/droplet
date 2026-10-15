import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardListIcon, MicrophoneIcon, PaletteIcon, TextFormatIcon } from '@solar-icons/react/linear'
import type { Icon } from '@solar-icons/react/lib/types'
import { BRAND_PARTS, ROLES_LEAD, BRAND_TITLES, brandPartsDone, type BrandPartId } from '../lib/brandParts.ts'
import { advanceBrand, backBrand, brandBlockers, brandLead, brandStepIndex, goToBrand, paletteResultOf, type BrandProgress, type PaletteResult } from '../lib/brandGuide.ts'
import { useGuideCard } from '../hooks/useGuideCard.ts'
import { cleanVoice } from '../lib/brandType.ts'
import { isRule } from '../lib/harmony.ts'
import { resolveRoles, type PaletteBlock } from '../lib/palette.ts'
import { DEFAULT_PALETTE_NAME, checkPaletteName, nameOfBlocks, sameName, upsertNamed, type NamedPalette } from '../lib/namedPalettes.ts'
import { readableRandomPalette, baseTarget } from '../lib/randomPalette.ts'
import { exportBrandSheet } from '../lib/exportSheet.ts'
import { useLoaded } from '../hooks/useLoaded.ts'
import { useProjectLogo } from '../hooks/useProjectLogo.ts'
import { loadPalette, markPaletteExported, savePalette, type PaletteSave } from '../lib/projectStore.ts'
import { MAX_BLOCKS, MIN_BLOCKS, canRedoState, canUndoState, docOf, isUnsaved, selectedBlock, type WorkspaceAction, type WorkspaceState } from '../lib/workspaceState.ts'
import BrandToolbar from './BrandToolbar.tsx'
import BrandPlan from './BrandPlan.tsx'
import BrandTypography from './BrandTypography.tsx'
import BrandVoice from './BrandVoice.tsx'
import ColourWheel from './ColourWheel.tsx'
import ContrastCircles from './ContrastCircles.tsx'
import ExportButton from './ExportButton.tsx'
import GuideFooter from './GuideFooter.tsx'
import RoleList from './RoleList.tsx'
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

const PART_ICONS: Record<BrandPartId, Icon> = { colours: PaletteIcon, typography: TextFormatIcon, voice: MicrophoneIcon, plan: ClipboardListIcon }

// The brand workspace. A toolbar of pills across the top (Undo, Redo, Generate random, Full screen; Download, Save), then two columns in two rows. Left: the colour wheel
// with its brightness slider, and under it the roles. Right: the palette as tall pills with their hex codes and roles, and under it a circle for each colour showing
// whether text reads on it. Nothing is boxed. In Guide mode the left is one part at a time (Colours, Roles, Contrast) with Back and Continue under it, and the task
// bar under the header is the stepper. Save keeps the palette as the working palette, under the name it already has.
export default function PaletteWorkspace({ mode, projectId, projectName, state, dispatch, progress, onProgress, onFinished, headerSlots }: Props) {
  // What was saved is read from storage, which takes a moment. Until it has arrived the toolbar says nothing and Save waits.
  const { value: saved, loaded, set: setSaved } = useLoaded<PaletteSave | null>(projectId, () => loadPalette(projectId), null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [saveNote, setSaveNote] = useState('')
  // Why a save could not be done (twenty palettes are kept already), shown as a problem and not as a status.
  const [saveProblem, setSaveProblem] = useState<string | null>(null)
  const [name, setName] = useState(DEFAULT_PALETTE_NAME)
  // The guide's other choices: the typeface pair and the voice words. Read from what was saved once it has arrived; kept with Save and Finish.
  const [fonts, setFonts] = useState<string | null>(null)
  const [voice, setVoice] = useState<string[]>([])
  const logo = useProjectLogo(projectId)
  const [fullscreen, setFullscreen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const guided = mode === 'guide'
  const { step } = progress
  const index = brandStepIndex(step)
  const last = index === BRAND_PARTS.length - 1
  // What was missing when Continue was pressed. Each goes as soon as it is fixed.
  const [blocked, setBlocked] = useState<string[]>([])
  const [finishNote, setFinishNote] = useState('')
  const [finishing, setFinishing] = useState(false)
  const { markMoved, focusProblem } = useGuideCard()

  const doc = docOf(state)
  const { blocks } = doc
  const selected = selectedBlock(state)
  const activeId = selected.id
  const harmony = state.harmony

  const roles = useMemo(() => resolveRoles(blocks), [blocks])
  const done = useMemo(() => brandPartsDone(blocks, { fonts, voice }), [blocks, fonts, voice])
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
  // The name the saved working palette was kept under, if it was.
  const savedName = saved ? nameOfBlocks(saved.palettes ?? [], saved.blocks) : null
  const nameChanged = loaded && saved !== null && savedName !== null && !sameName(name, savedName)
  const choicesChanged = loaded && ((saved?.fonts ?? null) !== fonts || cleanVoice(saved?.voice).join('|') !== voice.join('|'))
  const unsaved = loaded && (isUnsaved(doc, saved) || nameChanged || choicesChanged)

  const choices = { ...(fonts ? { fonts } : {}), ...(voice.length > 0 ? { voice } : {}) }

  // What was saved arrives once. The guide's choices start from it, and are the founder's own from then on.
  const choicesFrom = useRef<string | null>(null)
  useEffect(() => {
    if (!loaded || choicesFrom.current === projectId) return
    choicesFrom.current = projectId
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFonts(saved?.fonts ?? null)
    setVoice(cleanVoice(saved?.voice))
  }, [loaded, projectId, saved])

  const save = async () => {
    if (!loaded || !checkedName.ok) return
    const kept = upsertNamed(palettes, { name: checkedName.name, blocks })
    if (!kept.ok) {
      setSaveFailed(false)
      setSaveProblem(kept.reason)
      return
    }
    setSaveProblem(null)
    const result = await savePalette(projectId, { blocks, palettes: kept.list, ...choices })
    setSaveFailed(result === null)
    if (!result) return
    setSaved(result)
    setName(checkedName.name)
    setSaveNote(kept.replaced ? `Saved. This replaced the palette you had kept as “${checkedName.name}”.` : `Saved as “${checkedName.name}”.`)
  }

  // A palette that was saved and has not changed is marked as exported, so the library says so. One with unsaved changes is not: what was exported is
  // not what is saved.
  const exportSheet = useCallback(async () => {
    const exported = await exportBrandSheet(blocks, projectName, { fonts, voice })
    if (exported && saved && !isUnsaved(doc, saved)) {
      const marked = await markPaletteExported(projectId)
      if (marked) setSaved(marked)
    }
    return exported
    // doc is read for what is saved only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, projectName, projectId, saved, state, fonts, voice])

  // A short line under the toolbar. Nothing is saved until the founder saves.
  const status = saveProblem ? saveProblem : !loaded ? '' : saveFailed ? 'Could not save' : unsaved ? (!saved ? 'Not saved yet' : 'Unsaved changes') : saveNote || (saved ? 'All changes saved' : 'Not saved yet')

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
  const facts = { blocks, hasSaved, fonts, voice }
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
      const result = await savePalette(projectId, { blocks, ...choices })
      setFinishing(false)
      setSaveFailed(result === null)
      if (!result) return setFinishNote('I could not save the palette, because it could not be stored. Try again.')
      setSaved(result)
    }
    onFinished(paletteResultOf(blocks))
  }

  // In Guide mode a part already reached can be gone back to.
  const goTo = (id: BrandPartId) => move(goToBrand(progress, id))

  // Any change to the colour being worked on. With a harmony chosen the others follow it by the rule (a colour that is kept stays); in Custom it moves alone.
  const moveColour = (id: number, hex: string) => dispatch({ type: 'set_base', id, hex })

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

  // ---- The parts ----

  const wheel = (
    <ColourWheel large blocks={blocks} selectedId={activeId} onSelect={(id) => dispatch({ type: 'select', id })} onChange={moveColour} showRule={isRule(harmony)} />
  )

  const swatches = (
    <SwatchStrip
      blocks={blocks}
      roles={roles}
      selectedId={activeId}
      max={MAX_BLOCKS}
      min={MIN_BLOCKS}
      onSelect={(id) => dispatch({ type: 'select', id })}
      onRemove={(id) => dispatch({ type: 'remove_block', id })}
      onToggleLock={(id) => dispatch({ type: 'toggle_keep', id })}
      onToggleStar={(id) => dispatch({ type: 'toggle_star', id })}
    />
  )

  const footer = guided && (
    <GuideFooter canBack={index > 0} onBack={() => move(backBrand(progress))} last={last} onNext={next} onFinish={() => void finish()} missing={stillBlocked} note={finishNote} disabled={finishing} />
  )

  // ---- The frame: the same screen in both modes. Guide mode adds its Back and Continue under it. ----

  const colours = (
    <div className="brandgrid" data-full={fullscreen || undefined}>
      <div className="brandgrid__tools" data-part="colours" tabIndex={-1} hidden={fullscreen || undefined}>
        {wheel}
      </div>
      <div className="brandgrid__palette">{swatches}</div>
      <section className="brandgrid__roles" data-part="roles" tabIndex={-1} aria-label="Roles" hidden={fullscreen || undefined}>
        <h3 className="brandgrid__title">Roles</h3>
        <p className="brandgrid__lead">{ROLES_LEAD}</p>
        <RoleList held={false} blocks={blocks} roles={roles} onChange={(id, role) => dispatch({ type: 'set_role', id, role })} />
      </section>
      <div className="brandgrid__contrast">
        <ContrastCircles blocks={blocks} roles={roles} />
      </div>
    </div>
  )

  // Workspace mode is the colour screen alone. Guide mode walks through Colours, Typography, Voice and the Brand plan, with Back and Continue under each.
  const businessName = doc.businessName ?? projectName
  const screen =
    !guided || step === 'colours' ? (
      colours
    ) : step === 'typography' ? (
      <BrandTypography value={fonts} onChange={setFonts} roles={roles} businessName={businessName} />
    ) : step === 'voice' ? (
      <BrandVoice value={voice} onChange={setVoice} />
    ) : (
      <BrandPlan blocks={blocks} roles={roles} fonts={fonts} voice={voice} businessName={businessName} hasLogo={logo != null} />
    )

  const thing = (
    <>
      {screen}
      {footer}
    </>
  )

  return (
    <>
      <WorkspaceShell
        bar={guided && !fullscreen ? <TaskBar kind="parts" label="Parts of the brand" items={bar} /> : undefined}
        toolbar={(history) => (
          <BrandToolbar
            history={history}
            download={<ExportButton iconOnly ariaLabel="Download brand sheet" onExport={exportSheet} />}
            canSave={loaded}
            unsaved={unsaved}
            onSave={() => void save()}
            status={status}
            canRandom={baseTarget(blocks, activeId) !== null}
            onRandom={generateRandom}
            fullscreen={fullscreen}
            onFullscreen={toggleFullscreen}
          />
        )}
        swap
        hidePanel
        thing={thing}
        thingLabel="The palette"
        panelLabel="The colour tools"
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
