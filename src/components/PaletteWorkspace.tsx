import { useCallback, useMemo, useState } from 'react'
import { EyeIcon, LayersMinimalisticIcon, LockIcon, PaletteIcon, RestartIcon, CheckIcon } from '@solar-icons/react/linear'
import { shiftHue } from '../lib/colour.ts'
import { AUTO_COL, reconcile, samePlacements, type Placement } from '../lib/gridLayout.ts'
import { loadPalette, savePalette, type PaletteSave } from '../lib/projectStore.ts'
import ColourPicker from './ColourPicker.tsx'
import ContrastChecker from './ContrastChecker.tsx'
import GridWorkspace, { type WorkspaceItem } from './GridWorkspace.tsx'
import PaletteCanvas, { type PaletteBlock } from './PaletteCanvas.tsx'
import './PaletteWorkspace.css'

const MAX_BLOCKS = 8
const MIN_BLOCKS = 2 // a palette needs at least a pair, and the checker needs one colour to read
const STARTER_COLOURS = ['#1F8FE0', '#0B4F8A', '#CFE9FB', '#0E1A2B']

// Where things start, and where "Reset layout" puts them: the two toolbars side by side across the top
// (the second starts where the first ends) and the white canvas full width beneath them. Toolbar widths come
// from their content and the canvas row is only a preference, so nothing here reserves unused space.
const DEFAULT_LAYOUT: Placement[] = [
  { id: 'picker', col: 0, row: 0, w: 8 },
  { id: 'contrast', col: AUTO_COL, row: 0, w: 12 },
  { id: 'canvas', col: 0, row: 10, w: 24 },
]

const starterBlocks = (): PaletteBlock[] => STARTER_COLOURS.map((hex, index) => ({ id: index + 1, hex }))

type Props = {
  projectId: string
  projectName: string
}

// The palette workspace: a canvas of colour blocks plus the picker and contrast checker, all of which
// can be dragged anywhere on the grid. "Lock in" saves the palette and the layout to the project.
export default function PaletteWorkspace({ projectId, projectName }: Props) {
  const [saved, setSaved] = useState<PaletteSave | null>(() => loadPalette(projectId))
  const [blocks, setBlocks] = useState<PaletteBlock[]>(() => saved?.blocks ?? starterBlocks())
  const [layout, setLayout] = useState<Placement[]>(() => (saved ? reconcile(saved.layout, DEFAULT_LAYOUT) : DEFAULT_LAYOUT))
  const [selectedId, setSelectedId] = useState(() => (saved?.blocks ?? starterBlocks())[0].id)
  const [saveFailed, setSaveFailed] = useState(false)

  const selectedIndex = Math.max(0, blocks.findIndex((block) => block.id === selectedId))
  const selected = blocks[selectedIndex]
  const label = `Colour ${selectedIndex + 1}`

  const selectedHex = selected.hex

  const changeColour = useCallback(
    (hex: string) => setBlocks((current) => current.map((block) => (block.id === selectedId ? { ...block, hex } : block))),
    [selectedId],
  )

  const addBlock = useCallback(() => {
    if (blocks.length >= MAX_BLOCKS) return
    const id = Math.max(...blocks.map((block) => block.id)) + 1
    setBlocks((current) => [...current, { id, hex: shiftHue(selectedHex, 45) }])
    setSelectedId(id)
  }, [blocks, selectedHex])

  const removeBlock = useCallback(
    (id: number) => {
      if (blocks.length <= MIN_BLOCKS) return
      const index = blocks.findIndex((block) => block.id === id)
      if (index < 0) return
      const remaining = blocks.filter((block) => block.id !== id)
      setBlocks(remaining)
      // Removing the selected colour selects the one that takes its place (or the last, if it was last).
      if (id === selectedId) setSelectedId(remaining[Math.min(index, remaining.length - 1)].id)
    },
    [blocks, selectedId],
  )

  const layoutIsDefault = samePlacements(layout, DEFAULT_LAYOUT)
  const unsaved =
    !saved ||
    JSON.stringify(blocks) !== JSON.stringify(saved.blocks) ||
    !samePlacements(layout, saved.layout)

  const lockIn = () => {
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
              selectedId={selectedId}
              max={MAX_BLOCKS}
              min={MIN_BLOCKS}
              onSelect={setSelectedId}
              onAdd={addBlock}
              onRemove={removeBlock}
            />
          </div>
        ),
      },
      {
        id: 'contrast',
        title: 'Contrast checker',
        icon: EyeIcon,
        w: 12,
        radius: 'var(--radius-xl)',
        delay: 0.9,
        distance: 0.4,
        node: <ContrastChecker hex={selectedHex} checking={label} reason="Checks the selected colour as a background." />,
      },
    ],
    [blocks, selectedId, label, selectedHex, changeColour, addBlock, removeBlock],
  )

  return (
    <div className="palette-workspace">
      <div className="palette-workspace__toolbar">
        <p className="palette-workspace__status" role="status">
          {saveFailed
            ? 'Could not save in this browser.'
            : !saved
              ? `Nothing is saved until you lock in. Locking in saves this palette and layout to ${projectName}.`
              : unsaved
                ? `Changes since you locked in to ${projectName} are not saved.`
                : `Locked in to ${projectName}.`}
        </p>
        <div className="palette-workspace__actions">
          <button type="button" className="palette-workspace__button" disabled={layoutIsDefault} onClick={() => setLayout(DEFAULT_LAYOUT)}>
            <RestartIcon size={18} aria-hidden="true" />
            Reset layout
          </button>
          <button
            type="button"
            className="palette-workspace__button palette-workspace__button--primary"
            disabled={!unsaved}
            onClick={lockIn}
          >
            {unsaved ? <LockIcon size={18} aria-hidden="true" /> : <CheckIcon size={18} aria-hidden="true" />}
            {unsaved ? 'Lock in' : 'Locked in'}
          </button>
        </div>
      </div>

      <GridWorkspace items={items} layout={layout} onLayoutChange={setLayout} />
    </div>
  )
}
