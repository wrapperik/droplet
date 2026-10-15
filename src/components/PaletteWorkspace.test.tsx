import { useCallback, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { starterBlocks } from '../compose/fallback.ts'
import { startBrandGuide, type BrandProgress, type PaletteResult } from '../lib/brandGuide.ts'
import { loadPalette, savePalette } from '../lib/projectStore.ts'
import { canUndoState, docOf, openWorkspace, reduce, type WorkspaceAction } from '../lib/workspaceState.ts'
import PaletteWorkspace from './PaletteWorkspace.tsx'

const reader = vi.hoisted(() => ({ read: vi.fn(), sheet: vi.fn(async (..._args: unknown[]) => true) }))
vi.mock('../lib/imageColours.ts', () => ({ readImageColours: reader.read }))
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
const tools = () => screen.getByRole('region', { name: 'The colour tools' })
const palette = () => screen.getByRole('region', { name: 'The palette' })
const toolbar = () => screen.getByRole('toolbar', { name: 'Palette toolbar' })
const hexField = () => within(tools()).getByLabelText('Hex')

beforeEach(() => {
  window.localStorage.clear()
  reader.read.mockReset()
  reader.sheet.mockClear().mockResolvedValue(true)
})
afterEach(() => vi.restoreAllMocks())

describe('the brand workspace in Workspace mode', () => {
  it('has the tools on the left and the palette on the right, in that order in the page as well', () => {
    render(<Harness />)
    expect(tools().compareDocumentPosition(palette()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(tools()).getByRole('tablist', { name: 'Where the colours come from' })).toBeInTheDocument()
    expect(within(palette()).getByRole('region', { name: 'Document preview' })).toBeInTheDocument()
    expect(within(palette()).getByRole('region', { name: 'Contrast of the key pairs' })).toBeInTheDocument()
    expect(within(palette()).getByRole('group', { name: 'Palette colours' })).toBeInTheDocument()
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

  it('shows the colour wheel with the harmonies by default, and the other two sources on their tabs', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByRole('tab', { name: 'Colour wheel' })).toHaveAttribute('aria-selected', 'true')
    expect(within(tools()).getByRole('application', { name: /^Colour wheel for the palette/ })).toBeInTheDocument()
    expect(within(tools()).getByRole('heading', { name: 'Colour harmonies: Custom' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Image' }))
    expect(within(tools()).getByRole('button', { name: 'Upload your image' })).toBeInTheDocument()
    expect(within(tools()).queryByRole('application', { name: /^Colour wheel/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Base colour' }))
    expect(within(tools()).getByRole('application', { name: /^Spectrum for colour 1/ })).toBeInTheDocument()
  })

  it('changes the selected colour from its hex field and from its red, green and blue fields', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.clear(hexField())
    await user.type(hexField(), '#AA3355')
    expect(hexes()[0]).toBe('#AA3355')
    const red = within(tools()).getByLabelText('Red')
    await user.clear(red)
    await user.type(red, '17')
    expect(hexes()[0]).toBe('#113355')
    // half a number is not applied, and more than 255 is not a colour
    await user.clear(red)
    await user.type(red, '300')
    expect(hexes()[0]).not.toBe('#FF3355')
  })

  it('works on the colour that is selected on the right, and names it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(within(palette()).getByRole('radio', { name: /^Colour 3,/ }))
    expect(within(tools()).getByRole('heading', { name: 'Colour 3' })).toBeInTheDocument()
    expect(hexField()).toHaveValue(hexes()[2])
  })

  it('moves a colour alone in Custom, which is where it starts, so a saved palette is not scrambled by one change', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByTestId('harmony')).toHaveTextContent('custom')
    const before = hexes()
    await user.clear(hexField())
    await user.type(hexField(), '#AA3355')
    expect(hexes().slice(1)).toEqual(before.slice(1))
  })

  it('works the other colours out from the selected one when a harmony is chosen, in one undo step, and takes the rest back on Undo', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const before = hexes()
    await user.click(within(tools()).getByRole('button', { name: 'Triad' }))
    expect(screen.getByTestId('harmony')).toHaveTextContent('triad')
    expect(within(tools()).getByRole('heading', { name: 'Colour harmonies: Triad' })).toBeInTheDocument()
    expect(hexes()[0]).toBe(before[0])
    expect(hexes().slice(1)).not.toEqual(before.slice(1))
    await user.click(within(toolbar()).getByRole('button', { name: 'Undo' }))
    expect(hexes()).toEqual(before)
  })

  it('moves the others with the base by the rule, and leaves a kept colour where it is', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(within(palette()).getByRole('button', { name: /^Keep colour 4, .*when generating/ }))
    await user.click(within(tools()).getByRole('button', { name: 'Analogous' }))
    const ruled = hexes()
    await user.clear(hexField())
    await user.type(hexField(), '#CC2200')
    expect(hexes()[0]).toBe('#CC2200')
    expect(hexes()[3]).toBe(ruled[3])
    expect(hexes()[1]).not.toBe(ruled[1])
    // and in Custom each moves alone again
    await user.click(within(tools()).getByRole('button', { name: 'Custom' }))
    const custom = hexes()
    await user.clear(hexField())
    await user.type(hexField(), '#00AA55')
    expect(hexes().slice(1)).toEqual(custom.slice(1))
  })

  it('gives the selected colour a role from the Role choice, and says what is suggested', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const role = within(tools()).getByRole('combobox', { name: 'Role of colour 1' })
    await user.selectOptions(role, 'accent')
    expect(JSON.parse(screen.getByTestId('roles').textContent!)[0]).toBe('accent')
    expect(within(tools()).getByText(/You chose Accent/)).toBeInTheDocument()
    await user.selectOptions(role, '')
    expect(JSON.parse(screen.getByTestId('roles').textContent!)[0]).toBeNull()
  })

  it('shows each key pair of Contrast with its ratio and a word and an icon, never colour alone', () => {
    render(<Harness />)
    const rows = within(within(palette()).getByRole('region', { name: 'Contrast of the key pairs' })).getAllByRole('listitem')
    expect(rows.map((row) => row.querySelector('.clines__label')?.textContent)).toEqual(['Text on background', 'Primary on background', 'Accent on background'])
    for (const row of rows) {
      expect(row.textContent).toMatch(/\d+\.\d:1/)
      expect(row.textContent).toMatch(/Passes (AA|AAA)|Fails AA/)
      expect(row.querySelector('.badge__dot svg')).not.toBeNull()
    }
    expect(rows[0]).toHaveTextContent(/Passes/)
  })

  it('fails the text on the background in words when it cannot be read, and names the pair', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const text = starterBlocks().findIndex((block) => block.role === 'text')
    await user.click(within(palette()).getByRole('radio', { name: new RegExp(`^Colour ${text + 1},`) }))
    await user.clear(hexField())
    await user.type(hexField(), '#D5ECFB')
    const first = within(within(palette()).getByRole('region', { name: 'Contrast of the key pairs' })).getAllByRole('listitem')[0]
    expect(first).toHaveTextContent('Text on background')
    expect(first).toHaveTextContent('Fails AA')
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
    await user.click(within(palette()).getByRole('button', { name: /^Add colour$/ }))
    expect(hexes()).toHaveLength(5)
    expect(undo).toBeEnabled()
    await user.keyboard('{Control>}z{/Control}')
    expect(hexes()).toEqual(before)
    expect(redo).toBeEnabled()
    await user.click(redo)
    expect(hexes()).toHaveLength(5)
  })
})

describe('full screen', () => {
  it('hides the tools and gives the palette the whole width, keeps the toolbar, and says so', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const button = within(toolbar()).getByRole('button', { name: 'Full screen' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    const preview = within(palette()).getByRole('region', { name: 'Document preview' })
    await user.click(button)
    expect(screen.queryByRole('region', { name: 'The colour tools' })).not.toBeInTheDocument()
    expect(within(toolbar()).getByRole('button', { name: 'Exit full screen' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('toolbar', { name: 'Palette toolbar' })).toBeInTheDocument()
    expect(document.querySelector('.wsframe')).toHaveAttribute('data-full')
    expect(screen.getAllByRole('status').some((status) => /Full screen on/.test(status.textContent ?? ''))).toBe(true)
    // the preview is the same page, not drawn again
    expect(within(palette()).getByRole('region', { name: 'Document preview' })).toBe(preview)
  })

  it('goes back on the button and on Escape, and keeps the work and what was in the tools', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('tab', { name: 'Base colour' }))
    await user.click(within(toolbar()).getByRole('button', { name: 'Full screen' }))
    await user.click(within(toolbar()).getByRole('button', { name: 'Exit full screen' }))
    expect(tools()).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Base colour' })).toHaveAttribute('aria-selected', 'true')
    await user.click(within(toolbar()).getByRole('button', { name: 'Full screen' }))
    await user.keyboard('{Escape}')
    expect(within(toolbar()).getByRole('button', { name: 'Full screen' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByRole('status').some((status) => /Full screen off/.test(status.textContent ?? ''))).toBe(true)
  })

  it('is not saved: a new workspace opens as normal', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Harness />)
    await user.click(within(toolbar()).getByRole('button', { name: 'Full screen' }))
    unmount()
    render(<Harness />)
    expect(screen.getByRole('region', { name: 'The colour tools' })).toBeInTheDocument()
    expect(window.localStorage.getItem('droplet-project-duckstack-palette')).toBeNull()
  })

  it('lets Escape close a popover first, and leaves full screen on the next one', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(within(toolbar()).getByRole('button', { name: 'Full screen' }))
    await user.click(within(toolbar()).getByRole('button', { name: /^Saved palettes/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(toolbar()).getByRole('button', { name: 'Exit full screen' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(within(toolbar()).getByRole('button', { name: 'Full screen' })).toBeInTheDocument()
  })
})

describe('taking colours from a picture', () => {
  it('sets the palette from them in one undo step, and nothing before the button is pressed', async () => {
    const user = userEvent.setup()
    reader.read.mockResolvedValue({ ok: true, colours: ['#112233', '#AA5522', '#EEDDCC'] })
    render(<Harness />)
    const before = hexes()
    await user.click(screen.getByRole('tab', { name: 'Image' }))
    await user.upload(screen.getByLabelText('Choose a picture to take colours from'), new File(['x'], 'shop.png', { type: 'image/png' }))
    await screen.findByText('Colours taken from shop.png')
    expect(hexes()).toEqual(before)
    await user.click(screen.getByRole('button', { name: 'Use this palette' }))
    expect(hexes()).toEqual(['#112233', '#AA5522', '#EEDDCC'])
    await user.click(within(toolbar()).getByRole('button', { name: 'Undo' }))
    expect(hexes()).toEqual(before)
  })
})

describe('Download', () => {
  it('is an icon button in the toolbar that makes the brand sheet from the palette on screen', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(within(toolbar()).getByRole('button', { name: 'Download brand sheet' }))
    expect(reader.sheet).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ hex: hexes()[0] })]), 'DuckStack')
    expect(await screen.findByText('Brand sheet downloaded.')).toBeInTheDocument()
  })
})

describe('saving and the palettes that are kept', () => {
  const nameField = () => within(toolbar()).getByRole('textbox', { name: 'Palette name' })
  const save = () => within(toolbar()).getByRole('button', { name: /^Saved?$/ })

  it('starts with the name My colour theme, and says nothing is saved until Save is pressed', async () => {
    render(<Harness />)
    expect(nameField()).toHaveValue('My colour theme')
    expect(await screen.findByText('Not saved yet')).toBeInTheDocument()
    expect(window.localStorage.getItem('droplet-project-duckstack-palette')).toBeNull()
  })

  it('saves the colours as the working palette and again under the name, and says so', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await screen.findByText('Not saved yet')
    await user.clear(nameField())
    await user.type(nameField(), 'Spring')
    await user.click(save())
    const saved = (await loadPalette('duckstack'))!
    expect(saved.blocks.map((block) => block.hex)).toEqual(hexes())
    expect(saved.palettes).toHaveLength(1)
    expect(saved.palettes![0]).toMatchObject({ name: 'Spring' })
    expect(saved.palettes![0].blocks.map((block) => block.hex)).toEqual(hexes())
    expect(await screen.findByText('Saved as “Spring”.')).toBeInTheDocument()
  })

  it('holds Save back, and says why, when the name is empty or too long', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await screen.findByText('Not saved yet')
    await user.clear(nameField())
    expect(save()).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Give the palette a name.')
    await user.type(nameField(), 'x'.repeat(61))
    expect(save()).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('60 characters')
  })

  it('replaces a palette that has the same name, in any capitals, and says it did', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await screen.findByText('Not saved yet')
    await user.clear(nameField())
    await user.type(nameField(), 'Spring')
    await user.click(save())
    await screen.findByText('Saved as “Spring”.')
    await user.click(within(palette()).getByRole('button', { name: /^Add colour$/ }))
    await user.clear(nameField())
    await user.type(nameField(), 'SPRING')
    await user.click(save())
    expect(await screen.findByText('Saved. This replaced the palette you had kept as “SPRING”.')).toBeInTheDocument()
    const saved = (await loadPalette('duckstack'))!
    expect(saved.palettes).toHaveLength(1)
    expect(saved.palettes![0].blocks).toHaveLength(5)
  })

  it('lists the kept palettes, opens one as one undo step, and the name follows it', async () => {
    const user = userEvent.setup()
    await savePalette('duckstack', {
      blocks: starterBlocks(),
      palettes: [{ id: 'a', name: 'Summer', savedAt: '2026-10-05T10:00:00.000Z', blocks: [{ id: 1, hex: '#B5543A' }, { id: 2, hex: '#F7EFE6' }, { id: 3, hex: '#3B2A22' }] }],
    })
    render(<Harness />)
    await screen.findByText('All changes saved')
    await user.click(within(toolbar()).getByRole('button', { name: /^Saved palettes/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Open Summer' }))
    expect(hexes()).toEqual(['#B5543A', '#F7EFE6', '#3B2A22'])
    expect(nameField()).toHaveValue('Summer')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(within(toolbar()).getByRole('button', { name: 'Undo' }))
    expect(hexes()).toEqual(starterBlocks().map((block) => block.hex))
  })

  it('asks before opening a palette over colours that are not saved', async () => {
    const user = userEvent.setup()
    await savePalette('duckstack', {
      blocks: starterBlocks(),
      palettes: [{ id: 'a', name: 'Summer', savedAt: '2026-10-05T10:00:00.000Z', blocks: [{ id: 1, hex: '#B5543A' }, { id: 2, hex: '#F7EFE6' }] }],
    })
    render(<Harness />)
    await screen.findByText('All changes saved')
    await user.click(within(palette()).getByRole('button', { name: /^Add colour$/ }))
    await user.click(within(toolbar()).getByRole('button', { name: /^Saved palettes/ }))
    await user.click(screen.getByRole('button', { name: 'Open Summer' }))
    expect(hexes()).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: 'Open anyway' }))
    expect(hexes()).toEqual(['#B5543A', '#F7EFE6'])
  })

  it('forgets a kept palette after asking twice, and the list shows it gone', async () => {
    const user = userEvent.setup()
    await savePalette('duckstack', {
      blocks: starterBlocks(),
      palettes: [{ id: 'a', name: 'Summer', savedAt: '2026-10-05T10:00:00.000Z', blocks: [{ id: 1, hex: '#B5543A' }, { id: 2, hex: '#F7EFE6' }] }],
    })
    render(<Harness />)
    await screen.findByText('All changes saved')
    await user.click(within(toolbar()).getByRole('button', { name: /^Saved palettes/ }))
    await user.click(screen.getByRole('button', { name: 'Forget Summer' }))
    expect((await loadPalette('duckstack'))?.palettes).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Forget it' }))
    await waitFor(async () => expect((await loadPalette('duckstack'))?.palettes).toBeUndefined())
    expect(await screen.findByText(/No palettes are saved yet/)).toBeInTheDocument()
  })

  it('reads a palette saved before names existed without calling it changed', async () => {
    await savePalette('duckstack', { blocks: starterBlocks() })
    render(<Harness />)
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
    expect(nameField()).toHaveValue('My colour theme')
  })

  it('shows the name the working palette was kept under, and counts a changed name as an unsaved change', async () => {
    const user = userEvent.setup()
    await savePalette('duckstack', { blocks: starterBlocks(), palettes: [{ id: 'a', name: 'Summer', savedAt: '2026-10-05T10:00:00.000Z', blocks: starterBlocks() }] })
    render(<Harness />)
    await screen.findByText('All changes saved')
    expect(nameField()).toHaveValue('Summer')
    await user.type(nameField(), ' 2')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })
})
