import { useCallback, useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { starterBlocks } from '../compose/fallback.ts'
import { startBrandGuide, type BrandProgress, type PaletteResult } from '../lib/brandGuide.ts'
import { loadPalette, savePalette } from '../lib/projectStore.ts'
import { canUndoState, docOf, openWorkspace, reduce, type WorkspaceAction } from '../lib/workspaceState.ts'
import PaletteWorkspace from './PaletteWorkspace.tsx'

const reader = vi.hoisted(() => ({ sheet: vi.fn(async (..._args: unknown[]) => true) }))
vi.mock('../lib/exportSheet.ts', () => ({ exportBrandSheet: reader.sheet }))

type Slots = { start: HTMLElement; end: HTMLElement; shelf: HTMLElement }

function Harness({ mode = 'workspace', onFinished = () => {}, slots }: { mode?: 'guide' | 'workspace'; onFinished?: (result: PaletteResult) => void; slots?: Slots }) {
  const [state, setState] = useState(() => openWorkspace(starterBlocks()))
  const [progress, setProgress] = useState<BrandProgress>(startBrandGuide())
  const dispatch = useCallback((action: WorkspaceAction) => setState((current) => reduce(current, action)), [])
  return (
    <>
      <PaletteWorkspace mode={mode} projectId="duckstack" projectName="DuckStack" state={state} dispatch={dispatch} progress={progress} onProgress={setProgress} onFinished={onFinished} headerSlots={slots} />
      <output data-testid="hexes">{docOf(state).blocks.map((block) => block.hex).join(' ')}</output>
      <output data-testid="roles">{JSON.stringify(docOf(state).blocks.map((block) => block.role ?? null))}</output>
      <output data-testid="can-undo">{String(canUndoState(state))}</output>
      <output data-testid="harmony">{state.harmony}</output>
    </>
  )
}

const hexes = () => screen.getByTestId('hexes').textContent!.split(' ')
const palette = () => screen.getByRole('region', { name: 'The palette' })
const toolbar = () => screen.getByRole('toolbar', { name: 'Palette toolbar' })
const brightness = () => screen.getByRole('slider', { name: 'Brightness' })

beforeEach(() => {
  window.localStorage.clear()
  reader.sheet.mockClear().mockResolvedValue(true)
})
afterEach(() => vi.restoreAllMocks())

describe('the brand workspace in Workspace mode', () => {
  it('has the wheel and the roles on the left and the palette and the contrast circles on the right, in one frame', () => {
    render(<Harness />)
    const grid = document.querySelector('.brandgrid')!
    const parts = [...grid.children].map((part) => part.className)
    expect(parts).toEqual(['brandgrid__tools', 'brandgrid__palette', 'brandgrid__roles', 'brandgrid__contrast'])
    expect(within(palette()).getByRole('application', { name: /^Colour wheel for the palette/ })).toBeInTheDocument()
    expect(within(palette()).getByRole('group', { name: 'Palette colours' })).toBeInTheDocument()
    expect(within(palette()).getByRole('heading', { name: 'Roles' })).toBeInTheDocument()
    expect(within(palette()).getByRole('region', { name: 'Contrast' })).toBeInTheDocument()
  })

  it('has no cards, boxes or task bar: nothing sits in a container', () => {
    const { container } = render(<Harness />)
    expect(container.querySelector('.workspace__card')).toBeNull()
    expect(container.querySelector('.taskbar')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Parts of the brand' })).not.toBeInTheDocument()
  })

  it('puts nothing in the header: the controls are in its own toolbar', () => {
    const slots: Slots = { start: document.createElement('div'), end: document.createElement('div'), shelf: document.createElement('div') }
    render(<Harness slots={slots} />)
    expect(slots.start.children).toHaveLength(0)
    expect(slots.end.children).toHaveLength(0)
    expect(slots.shelf.children).toHaveLength(0)
    expect(within(toolbar()).getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('has no way to move, resize, hide or reset anything', () => {
    const { container } = render(<Harness />)
    for (const name of [/Windows/, /Reset layout/, /Add or remove/, /drag/i]) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    expect(container.querySelector('[draggable="true"], .gw__item')).toBeNull()
  })

  it('still has the parts that Show me and the receipts go to: colours, roles and contrast', () => {
    render(<Harness />)
    for (const id of ['colours', 'roles', 'contrast']) expect(document.querySelector(`[data-part="${id}"]`), id).not.toBeNull()
  })

  it('has only the wheel and its brightness to choose colours with: no tabs, harmonies, hex fields, picture or sample document', () => {
    render(<Harness />)
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Colour harmonies/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Hex')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upload your image' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Document preview' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Saved palettes/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Palette name' })).not.toBeInTheDocument()
  })

  it('changes the selected colour from the brightness slider, and works on the colour that is selected on the right', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(within(palette()).getByRole('radio', { name: /^Colour 3,/ }))
    expect(screen.getByRole('application', { name: /The selected colour is #CFE9FB/ })).toBeInTheDocument()
    const before = hexes()
    fireEvent.change(brightness(), { target: { value: '50' } })
    expect(hexes()[2]).not.toBe(before[2])
    expect(hexes().filter((_, index) => index !== 2)).toEqual(before.filter((_, index) => index !== 2))
  })

  it('moves a colour alone in Custom, which is where it starts, so a saved palette is not scrambled by one change', () => {
    render(<Harness />)
    expect(screen.getByTestId('harmony')).toHaveTextContent('custom')
    const before = hexes()
    fireEvent.change(brightness(), { target: { value: '50' } })
    expect(hexes().slice(1)).toEqual(before.slice(1))
  })

  it('gives a colour a role from its Role choice', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const role = within(palette()).getByRole('combobox', { name: 'Role of colour 1, #1F8FE0' })
    await user.selectOptions(role, 'accent')
    expect(JSON.parse(screen.getByTestId('roles').textContent!)[0]).toBe('accent')
    await user.selectOptions(role, '')
    expect(JSON.parse(screen.getByTestId('roles').textContent!)[0]).toBeNull()
  })

  it('shows a circle for each colour with a word and an icon for whether text reads on it, never colour alone', () => {
    render(<Harness />)
    const circles = within(within(palette()).getByRole('region', { name: 'Contrast' })).getAllByRole('listitem')
    expect(circles).toHaveLength(4)
    for (const circle of circles) {
      expect(circle.textContent).toMatch(/Passes (AA|AAA)|Fails AA/)
      expect(circle.querySelector('.ccircles__dot svg')).not.toBeNull()
      expect(within(circle).getByRole('img', { name: /text on it is \d+\.\d to 1/ })).toBeInTheDocument()
    }
  })

  it('fails a colour in words when text cannot be read on it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    // Droplet blue as the text colour does not read on the pale background.
    await user.selectOptions(within(palette()).getByRole('combobox', { name: 'Role of colour 1, #1F8FE0' }), 'text')
    const circles = within(within(palette()).getByRole('region', { name: 'Contrast' })).getAllByRole('listitem')
    expect(circles[0]).toHaveTextContent('Fails AA')
  })
})

describe('Generate random', () => {
  it('fills the palette from a random base and a random harmony in one undo step', async () => {
    const user = userEvent.setup()
    vi.spyOn(Math, 'random').mockReturnValue(0.37)
    render(<Harness />)
    const before = hexes()
    await user.click(within(toolbar()).getByRole('button', { name: 'Generate random' }))
    expect(hexes()).not.toEqual(before)
    expect(screen.getByTestId('harmony')).not.toHaveTextContent('custom')
    await user.click(within(toolbar()).getByRole('button', { name: 'Undo' }))
    expect(hexes()).toEqual(before)
    expect(screen.getByTestId('can-undo')).toHaveTextContent('false')
  })

  it('leaves the colours that are kept', async () => {
    const user = userEvent.setup()
    vi.spyOn(Math, 'random').mockReturnValue(0.62)
    render(<Harness />)
    const before = hexes()
    await user.click(within(palette()).getByRole('button', { name: /^Keep colour 3, .*when generating/ }))
    await user.click(within(toolbar()).getByRole('button', { name: 'Generate random' }))
    expect(hexes()[2]).toBe(before[2])
    expect(hexes()[0]).not.toBe(before[0])
  })

  it('is off when every colour is kept', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    for (let n = 1; n <= 4; n += 1) await user.click(within(palette()).getByRole('button', { name: new RegExp(`^Keep colour ${n}, .*when generating`) }))
    expect(within(toolbar()).getByRole('button', { name: 'Generate random' })).toBeDisabled()
  })
})

describe('undo and redo', () => {
  it('are in the toolbar, disabled until there is something to undo or redo, and the keyboard does the same', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const undo = within(toolbar()).getByRole('button', { name: 'Undo' })
    const redo = within(toolbar()).getByRole('button', { name: 'Redo' })
    expect(undo).toBeDisabled()
    expect(redo).toBeDisabled()
    const before = hexes()
    fireEvent.change(brightness(), { target: { value: '50' } })
    expect(hexes()).not.toEqual(before)
    expect(undo).toBeEnabled()
    await user.keyboard('{Control>}z{/Control}')
    expect(hexes()).toEqual(before)
    expect(redo).toBeEnabled()
    await user.click(redo)
    expect(hexes()).not.toEqual(before)
  })
})

describe('full screen', () => {
  it('hides the wheel and the roles and gives the palette the whole width, keeps the toolbar, and says so', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const button = within(toolbar()).getByRole('button', { name: 'Full screen' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    const swatches = within(palette()).getByRole('group', { name: 'Palette colours' })
    await user.click(button)
    expect(document.querySelector('.brandgrid__tools')).toHaveAttribute('hidden')
    expect(document.querySelector('.brandgrid__roles')).toHaveAttribute('hidden')
    expect(document.querySelector('.brandgrid')).toHaveAttribute('data-full')
    expect(within(toolbar()).getByRole('button', { name: 'Exit full screen' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('status').some((status) => /Full screen on/.test(status.textContent ?? ''))).toBe(true)
    // the palette is the same one, not drawn again
    expect(within(palette()).getByRole('group', { name: 'Palette colours' })).toBe(swatches)
  })

  it('goes back on the button and on Escape, and keeps the work', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    fireEvent.change(brightness(), { target: { value: '50' } })
    const changed = hexes()
    await user.click(within(toolbar()).getByRole('button', { name: 'Full screen' }))
    await user.click(within(toolbar()).getByRole('button', { name: 'Exit full screen' }))
    expect(document.querySelector('.brandgrid__tools')).not.toHaveAttribute('hidden')
    await user.click(within(toolbar()).getByRole('button', { name: 'Full screen' }))
    await user.keyboard('{Escape}')
    expect(within(toolbar()).getByRole('button', { name: 'Full screen' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByRole('status').some((status) => /Full screen off/.test(status.textContent ?? ''))).toBe(true)
    expect(hexes()).toEqual(changed)
  })

  it('is not saved: a new workspace opens as normal', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Harness />)
    await user.click(within(toolbar()).getByRole('button', { name: 'Full screen' }))
    unmount()
    render(<Harness />)
    expect(document.querySelector('.brandgrid__tools')).not.toHaveAttribute('hidden')
    expect(window.localStorage.getItem('droplet-project-duckstack-palette')).toBeNull()
  })
})

describe('Download', () => {
  it('is an icon button in the toolbar that makes the brand sheet from the palette on screen', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(within(toolbar()).getByRole('button', { name: 'Download brand sheet' }))
    expect(reader.sheet).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ hex: hexes()[0] })]), 'DuckStack', expect.anything())
    expect(await screen.findByText('Brand sheet downloaded.')).toBeInTheDocument()
  })
})

describe('saving', () => {
  const save = () => within(toolbar()).getByRole('button', { name: /^Saved?$/ })

  it('says nothing is saved until Save is pressed', async () => {
    render(<Harness />)
    expect(await screen.findByText('Not saved yet')).toBeInTheDocument()
    expect(window.localStorage.getItem('droplet-project-duckstack-palette')).toBeNull()
  })

  it('saves the colours as the working palette and again under the name they have', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await screen.findByText('Not saved yet')
    await user.click(save())
    const saved = (await loadPalette('duckstack'))!
    expect(saved.blocks.map((block) => block.hex)).toEqual(hexes())
    expect(saved.palettes).toHaveLength(1)
    expect(saved.palettes![0]).toMatchObject({ name: 'My colour theme' })
    expect(await screen.findByText('Saved as “My colour theme”.')).toBeInTheDocument()
  })

  it('replaces the palette it was kept as when saved again, and says it did', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await screen.findByText('Not saved yet')
    await user.click(save())
    await screen.findByText('Saved as “My colour theme”.')
    fireEvent.change(brightness(), { target: { value: '50' } })
    await user.click(save())
    expect(await screen.findByText('Saved. This replaced the palette you had kept as “My colour theme”.')).toBeInTheDocument()
    expect((await loadPalette('duckstack'))!.palettes).toHaveLength(1)
  })

  it('saves under the name the working palette was kept under', async () => {
    const user = userEvent.setup()
    await savePalette('duckstack', { blocks: starterBlocks(), palettes: [{ id: 'a', name: 'Summer', savedAt: '2026-10-05T10:00:00.000Z', blocks: starterBlocks() }] })
    render(<Harness />)
    await screen.findByText('All changes saved')
    fireEvent.change(brightness(), { target: { value: '50' } })
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    await user.click(save())
    expect(await screen.findByText('Saved. This replaced the palette you had kept as “Summer”.')).toBeInTheDocument()
  })

  it('reads a palette saved before names existed without calling it changed', async () => {
    await savePalette('duckstack', { blocks: starterBlocks() })
    render(<Harness />)
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
  })
})
