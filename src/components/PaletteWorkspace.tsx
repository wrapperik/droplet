import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BillListIcon,
  CheckIcon,
  LayersMinimalisticIcon,
  DisketteIcon,
  MagicWand3Icon,
  PaletteIcon,
  RestartIcon,
  TagIcon,
  UndoLeftIcon,
  UndoRightIcon,
} from '@solar-icons/react/linear'
import { shiftHue } from '../lib/colour.ts'
import { AUTO_COL, reconcile, samePlacements, type Placement } from '../lib/gridLayout.ts'
import { generatePalette, replaceableIds, type Harmony } from '../lib/harmony.ts'
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from '../lib/history.ts'
import { assignRole, resolveRoles, type ColourRole, type PaletteBlock } from '../lib/palette.ts'
import { brandSheetData } from '../lib/paletteExport.ts'
import { loadPalette, savePalette, type PaletteSave } from '../lib/projectStore.ts'
import ColourPicker from './ColourPicker.tsx'
import DocumentPreview from './DocumentPreview.tsx'
import ExportButton from './ExportButton.tsx'
import GenerateToolbar from './GenerateToolbar.tsx'
import GridWorkspace, { type WorkspaceItem } from './GridWorkspace.tsx'
import PaletteCanvas from './PaletteCanvas.tsx'
import RoleToolbar from './RoleToolbar.tsx'
import './PaletteWorkspace.css'

const MAX_BLOCKS = 8
const MIN_BLOCKS = 2 // a palette needs at least a pair, and the checks need a colour to read against
const STARTER_COLOURS = ['#1F8FE0', '#0B4F8A', '#CFE9FB', '#0E1A2B']

// Where things start, and where "Reset layout" puts them. The three toolbars in one row across the top: each
// starts where the one before it ends, so neighbours are exactly one grid gap apart, and one that does not fit
// in what is left of the row drops beneath the first, lined up with it. Then the white canvas full width, and the
// document preview under that. Toolbar widths come from their content and rows are only a preference, so
// nothing here reserves unused space.
const DEFAULT_LAYOUT: Placement[] = [
  { id: 'picker', col: 0, row: 0, w: 8 },
  { id: 'role', col: AUTO_COL, row: 0, w: 10 },
  { id: 'generate', col: AUTO_COL, row: 0, w: 9 },
  { id: 'canvas', col: 0, row: 10, w: 24 },
  { id: 'preview', col: 0, row: 20, w: 12 },
]

const starterBlocks = (): PaletteBlock[] => STARTER_COLOURS.map((hex, index) => ({ id: index + 1, hex }))

// True when the key press belongs to a text field, which has its own undo.
const inTextField = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

type Props = {
  projectId: string
  projectName: string
}

// The palette workspace: a canvas of colour blocks with the toolbars and panels that work on it, all of which
// can be dragged anywhere on the grid. "Save" saves the palette and the layout to the project.
export default function PaletteWorkspace({ projectId, projectName }: Props) {
  const [saved, setSaved] = useState<PaletteSave | null>(() => loadPalette(projectId))
  const [history, setHistory] = useState<History<PaletteBlock[]>>(() => createHistory(saved?.blocks ?? starterBlocks()))
  const [layout, setLayout] = useState<Placement[]>(() => (saved ? reconcile(saved.layout, DEFAULT_LAYOUT) : DEFAULT_LAYOUT))
  const [selectedId, setSelectedId] = useState(() => (saved?.blocks ?? starterBlocks())[0].id)
  const [saveFailed, setSaveFailed] = useState(false)
  const [harmony, setHarmony] = useState<Harmony>('analogous')
  const [variation, setVariation] = useState(0)
  const [historyNote, setHistoryNote] = useState('')

  const blocks = history.present
  // After an undo the selected colour may no longer exist, so fall back to the first rather than editing nothing.
  const selectedIndex = Math.max(0, blocks.findIndex((block) => block.id === selectedId))
  const selected = blocks[selectedIndex]
  const activeId = selected.id
  const label = `Colour ${selectedIndex + 1}`
  const selectedHex = selected.hex
  const selectedRole = selected.role

  // Every change to the palette goes through here, so it can be undone. Edits with the same key that follow one
  // another quickly (dragging across the spectrum) count as one step.
  const change = useCallback(
    (next: (current: PaletteBlock[]) => PaletteBlock[], key: string | null = null) =>
      setHistory((current) => commit(current, next(current.present), key)),
    [],
  )

  const changeColour = useCallback(
    (hex: string) => change((current) => current.map((block) => (block.id === activeId ? { ...block, hex } : block)), `colour-${activeId}`),
    [activeId, change],
  )

  const changeRole = useCallback((role: ColourRole | null) => change((current) => assignRole(current, activeId, role)), [activeId, change])

  const toggleLock = useCallback(
    (id: number) => change((current) => current.map((block) => (block.id === id ? { ...block, locked: !block.locked } : block))),
    [change],
  )

  const roles = useMemo(() => resolveRoles(blocks), [blocks])

  const addBlock = useCallback(() => {
    if (blocks.length >= MAX_BLOCKS) return
    const id = Math.max(...blocks.map((block) => block.id)) + 1
    change((current) => [...current, { id, hex: shiftHue(selectedHex, 45) }])
    setSelectedId(id)
  }, [blocks, selectedHex, change])

  const removeBlock = useCallback(
    (id: number) => {
      if (blocks.length <= MIN_BLOCKS) return
      const index = blocks.findIndex((block) => block.id === id)
      if (index < 0) return
      const remaining = blocks.filter((block) => block.id !== id)
      change(() => remaining)
      // Removing the selected colour selects the one that takes its place (or the last, if it was last).
      if (id === activeId) setSelectedId(remaining[Math.min(index, remaining.length - 1)].id)
    },
    [blocks, activeId, change],
  )

  const canGenerate = replaceableIds(blocks, activeId).length > 0
  const generate = useCallback(() => {
    change((current) => generatePalette(current, activeId, harmony, variation))
    setVariation((current) => current + 1)
  }, [activeId, harmony, variation, change])

  const downloadSheet = useCallback(async () => {
    // The PDF library is large, so it is fetched only now.
    const { downloadBrandSheet } = await import('../export/brandSheet.tsx')
    return downloadBrandSheet(brandSheetData(blocks, roles, projectName, new Date()), projectName)
  }, [blocks, roles, projectName])

  const undoStep = useCallback(() => {
    if (!canUndo(history)) return
    setHistory(undo)
    setHistoryNote('Undone.')
  }, [history])

  const redoStep = useCallback(() => {
    if (!canRedo(history)) return
    setHistory(redo)
    setHistoryNote('Redone.')
  }, [history])

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

  const layoutIsDefault = samePlacements(layout, DEFAULT_LAYOUT)
  const unsaved =
    !saved ||
    JSON.stringify(blocks) !== JSON.stringify(saved.blocks) ||
    !samePlacements(layout, saved.layout)

  const save = () => {
    const result = savePalette(projectId, { blocks, layout })
    setSaveFailed(result === null)
    if (result) setSaved(result)
  }

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
        node: (
          <ColourPicker
            value={selectedHex}
            onChange={changeColour}
            editing={label}
            reason="Shown because you asked for a colour palette. Click the colour to open the full spectrum."
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
        node: (
          <RoleToolbar
            hex={selectedHex}
            editing={label}
            role={selectedRole}
            onChange={changeRole}
            reason="Says what the selected colour is for, so the preview and the brand sheet know which colour is the text."
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
        node: (
          <GenerateToolbar
            harmony={harmony}
            onHarmonyChange={setHarmony}
            onGenerate={generate}
            canGenerate={canGenerate}
            from={label}
            reason="Suggests colours that go with the selected one. Keep a colour with its lock and Generate will leave it alone."
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
        node: (
          <div className="palette-workspace__canvas">
            <PaletteCanvas
              blocks={blocks}
              selectedId={activeId}
              max={MAX_BLOCKS}
              min={MIN_BLOCKS}
              onSelect={setSelectedId}
              onAdd={addBlock}
              onRemove={removeBlock}
              onToggleLock={toggleLock}
              reason="The colours you are choosing between. Select one to edit it."
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
        node: (
          <div className="palette-workspace__canvas">
            <DocumentPreview roles={roles} reason="Shows the palette on a real document, because swatches alone do not show how it will work." />
          </div>
        ),
      },
    ],
    [
      blocks,
      activeId,
      label,
      selectedHex,
      selectedRole,
      roles,
      harmony,
      canGenerate,
      changeColour,
      changeRole,
      addBlock,
      removeBlock,
      toggleLock,
      generate,
    ],
  )

  return (
    <div className="palette-workspace">
      <div className="palette-workspace__toolbar">
        <p className="palette-workspace__status" role="status">
          {saveFailed
            ? 'Could not save in this browser.'
            : !saved
              ? ''
              : unsaved
                ? `Changes since you last saved to ${projectName} are not saved.`
                : `Saved to ${projectName}.`}
        </p>
        <div className="palette-workspace__actions">
          <div className="palette-workspace__history" role="group" aria-label="History">
            <button type="button" className="palette-workspace__icon-button" disabled={!canUndo(history)} onClick={undoStep} aria-label="Undo">
              <UndoLeftIcon size={18} aria-hidden="true" />
            </button>
            <button type="button" className="palette-workspace__icon-button" disabled={!canRedo(history)} onClick={redoStep} aria-label="Redo">
              <UndoRightIcon size={18} aria-hidden="true" />
            </button>
          </div>
          <button type="button" className="palette-workspace__button" disabled={layoutIsDefault} onClick={() => setLayout(DEFAULT_LAYOUT)}>
            <RestartIcon size={18} aria-hidden="true" />
            Reset layout
          </button>
          <button
            type="button"
            className="palette-workspace__button palette-workspace__button--primary"
            disabled={!unsaved}
            onClick={save}
          >
            {unsaved ? <DisketteIcon size={18} aria-hidden="true" /> : <CheckIcon size={18} aria-hidden="true" />}
            {unsaved ? 'Save' : 'Saved'}
          </button>
          <ExportButton onExport={downloadSheet} />
        </div>
      </div>
      <p className="visually-hidden" role="status">
        {historyNote}
      </p>

      <GridWorkspace items={items} layout={layout} onLayoutChange={setLayout} />
    </div>
  )
}
