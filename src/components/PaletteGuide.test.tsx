import { useCallback, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { starterBlocks } from '../compose/fallback.ts'
import { BRAND_PARTS, BRAND_TITLES } from '../lib/brandParts.ts'
import { startBrandGuide, type BrandProgress, type PaletteResult } from '../lib/brandGuide.ts'
import { contrastRatio, hexToRgb } from '../lib/colour.ts'
import type { PaletteBlock } from '../lib/palette.ts'
import { resolveRoles } from '../lib/palette.ts'
import { savePalette } from '../lib/projectStore.ts'
import { canUndoState, docOf, openWorkspace, reduce, type WorkspaceAction } from '../lib/workspaceState.ts'
import PaletteWorkspace from './PaletteWorkspace.tsx'

// The whole workspace, wired to the real reducer as Home does, in either mode.
type Slots = { start: HTMLElement; end: HTMLElement; shelf: HTMLElement }
function Harness({ mode = 'guide', initial, onFinished = () => {}, slots }: { mode?: 'guide' | 'workspace'; initial?: PaletteBlock[]; onFinished?: (result: PaletteResult) => void; slots?: Slots }) {
  const [state, setState] = useState(() => openWorkspace(initial ?? starterBlocks()))
  const [progress, setProgress] = useState<BrandProgress>(startBrandGuide())
  const dispatch = useCallback((action: WorkspaceAction) => setState((current) => reduce(current, action)), [])
  return (
    <>
      <PaletteWorkspace mode={mode} projectId="duckstack" projectName="DuckStack" state={state} dispatch={dispatch} progress={progress} onProgress={setProgress} onFinished={onFinished} headerSlots={slots} />
      <output data-testid="hexes">{docOf(state).blocks.map((block) => block.hex).join(' ')}</output>
      <output data-testid="can-undo">{String(canUndoState(state))}</output>
      <output data-testid="roles">{JSON.stringify(docOf(state).blocks.map((block) => block.role ?? null))}</output>
    </>
  )
}

const bar = () => screen.getByRole('group', { name: 'Parts of the brand' })
const part = (name: string) => within(bar()).getByRole('button', { name: new RegExp(`^${name}`) })
const hexes = () => screen.getByTestId('hexes').textContent!.split(' ')
const cards = () => screen.getAllByRole('radio', { name: /^Palette \d/ })
const addColour = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: /^Add #/ }))
const showPalettes = async (user: ReturnType<typeof userEvent.setup>) => {
  await addColour(user)
  await user.click(screen.getByRole('button', { name: 'Show palettes' }))
}

// A palette whose text is nearly the colour of its background.
const unreadable: PaletteBlock[] = [
  { id: 1, hex: '#1F8FE0', role: 'primary' },
  { id: 2, hex: '#0B4F8A', role: 'accent' },
  { id: 3, hex: '#CFE9FB', role: 'background' },
  { id: 4, hex: '#A9D0EE', role: 'text' },
]

beforeEach(() => window.localStorage.clear())

describe('the brand workspace in Guide mode', () => {
  it('shows one part at a time, Colours first, with the count and Back and Continue under it', () => {
    render(<Harness />)
    expect(screen.getByRole('region', { name: BRAND_TITLES.colours })).toBeInTheDocument()
    for (const id of BRAND_PARTS.slice(1)) expect(screen.queryByRole('region', { name: BRAND_TITLES[id] })).not.toBeInTheDocument()
    // the key pairs are on the right, under the palette, until the Contrast step puts them on the left
    expect(screen.getByRole('region', { name: 'Contrast of the key pairs' })).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  })

  it('has the three parts as steps on the task bar, which Workspace mode does not have, and marks the current one as the step', () => {
    const { unmount } = render(<Harness mode="workspace" />)
    expect(screen.queryByRole('group', { name: 'Parts of the brand' })).not.toBeInTheDocument()
    unmount()
    render(<Harness mode="guide" />)
    expect(within(bar()).getAllByRole('button').map((button) => button.querySelector('.taskbar__label')?.textContent)).toEqual(['Colours', 'Roles', 'Contrast'])
    expect(part('Colours')).toHaveAttribute('aria-current', 'step')
    expect(part('Contrast')).toHaveAttribute('aria-disabled', 'true')
    expect(part('Contrast')).toHaveTextContent('not reached yet')
  })

  it('has the same toolbar as Workspace mode, and the palette on the right with the sample document, and the step on the left', () => {
    render(<Harness />)
    const toolbar = screen.getByRole('toolbar', { name: 'Palette toolbar' })
    for (const name of ['Undo', 'Redo', 'Generate random', 'Full screen']) expect(within(toolbar).getByRole('button', { name })).toBeInTheDocument()
    const steps = screen.getByRole('region', { name: 'Step 1 of 3: Colours' })
    const palette = screen.getByRole('region', { name: 'The palette' })
    expect(steps.compareDocumentPosition(palette) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(palette).getByRole('region', { name: 'Document preview' })).toBeInTheDocument()
    // no card round the step
    expect(steps.querySelector('.workspace__card')).toBeNull()
  })

  it('puts nothing in the header, and the stepper in the shelf, in Guide mode only', async () => {
    const slots = { start: document.createElement('div'), end: document.createElement('div'), shelf: document.createElement('div') }
    document.body.append(slots.start, slots.end, slots.shelf)
    const { unmount } = render(<Harness slots={slots} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /^Saved?$/ })).toBeEnabled())
    expect(slots.start.children).toHaveLength(0)
    expect(slots.end.children).toHaveLength(0)
    expect(within(slots.shelf).getByRole('group', { name: 'Parts of the brand' })).toBeInTheDocument()
    unmount()
    const empty = { start: document.createElement('div'), end: document.createElement('div'), shelf: document.createElement('div') }
    render(<Harness mode="workspace" slots={empty} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /^Saved?$/ })).toBeEnabled())
    expect(empty.shelf.children).toHaveLength(0)
  })

  it('hides the steps and the stepper in full screen, and brings them back', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Full screen' }))
    expect(screen.queryByRole('group', { name: 'Parts of the brand' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Step 1 of 3: Colours' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'The palette' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('group', { name: 'Parts of the brand' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Step 1 of 3: Colours' })).toBeInTheDocument()
  })

  it('says in its lead that the Colours step asks for colours the founder likes, and keeps the other leads', () => {
    render(<Harness />)
    expect(screen.getByRole('region', { name: BRAND_TITLES.colours })).toHaveTextContent('Pick up to three colours you like.')
  })

  it('does not go to a part that has not been reached from the bar', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(part('Contrast'))
    expect(screen.queryByRole('region', { name: BRAND_TITLES.contrast })).not.toBeInTheDocument()
    expect(part('Colours')).toHaveAttribute('aria-current', 'step')
  })

  it('holds Continue back on Colours until a palette has been chosen, and says why', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Before you go on:')
    expect(screen.getByRole('alert')).toHaveTextContent('Choose one of the palettes first')
    expect(screen.getByRole('region', { name: BRAND_TITLES.colours })).toBeInTheDocument()
  })

  it('adds up to three colours as chips, each of which can be removed, and offers Show palettes only once there is one', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Show palettes' })).toBeDisabled()
    await addColour(user)
    expect(screen.getByRole('heading', { name: 'Your colours (1 of 3)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show palettes' })).toBeEnabled()
    // the same colour twice is not added again
    await addColour(user)
    expect(screen.getByRole('heading', { name: 'Your colours (1 of 3)' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove #1F8FE0' }))
    expect(screen.getByRole('heading', { name: 'Your colours (0 of 3)' })).toBeInTheDocument()
  })

  it('shows three palettes, built in code, with their roles and the contrast in words, never colour alone', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await showPalettes(user)
    expect(cards()).toHaveLength(3)
    for (const card of cards()) {
      expect(card).toHaveAccessibleName(/Primary #1F8FE0/)
      expect(card).toHaveAccessibleName(/Text on background \d+\.\d to 1, Passes (AA|AAA)/)
      expect(card.querySelector('.badge__dot svg')).not.toBeNull()
      expect(card).toHaveTextContent('Primary')
      expect(card).toHaveTextContent('Background')
    }
  })

  it('shows three different palettes when asked for more', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await showPalettes(user)
    const first = cards().map((card) => card.textContent)
    await user.click(screen.getByRole('button', { name: 'Show 3 more' }))
    const second = cards().map((card) => card.textContent)
    expect(cards()).toHaveLength(3)
    for (const text of second) expect(first).not.toContain(text)
  })

  it('sets the palette in one undo step when a card is chosen, and the page shows it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const before = hexes()
    expect(screen.getByTestId('can-undo')).toHaveTextContent('false')
    await showPalettes(user)
    // showing the palettes changes nothing yet
    expect(hexes()).toEqual(before)
    await user.click(cards()[1])
    expect(hexes()).not.toEqual(before)
    expect(cards()[1]).toHaveAttribute('aria-checked', 'true')
    expect(hexes()[0]).toBe('#1F8FE0')
    // the sample document is drawn in the chosen colours
    const preview = screen.getByRole('region', { name: 'Document preview' })
    expect(preview).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(hexes()).toEqual(before)
    expect(screen.getByTestId('can-undo')).toHaveTextContent('false')
  })

  it('moves on once a palette is chosen, to Roles and then Contrast, with the count and the step marked', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await showPalettes(user)
    await user.click(cards()[0])
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('region', { name: BRAND_TITLES.roles })).toBeInTheDocument()
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
    expect(part('Roles')).toHaveAttribute('aria-current', 'step')
    // Continue is never held back on Roles
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('region', { name: BRAND_TITLES.contrast })).toBeInTheDocument()
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument()
    // a part already reached can be gone back to, and forward again
    await user.click(part('Colours'))
    expect(await screen.findByRole('region', { name: BRAND_TITLES.colours })).toBeInTheDocument()
    await user.click(part('Contrast'))
    expect(await screen.findByRole('region', { name: BRAND_TITLES.contrast })).toBeInTheDocument()
  })

  it('lets the founder carry on with a palette the project already has saved, and says so', async () => {
    const user = userEvent.setup()
    await savePalette('duckstack', { blocks: starterBlocks() })
    render(<Harness />)
    expect(await screen.findByText(/already has a saved palette/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('region', { name: BRAND_TITLES.roles })).toBeInTheDocument()
  })

  it('offers Make it more readable only while the text fails, and it is one undo step that makes the text read', async () => {
    const user = userEvent.setup()
    render(<Harness initial={unreadable} />)
    // The palette is not the starter, so the founder can carry on.
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    const contrast = within(await screen.findByRole('region', { name: BRAND_TITLES.contrast }))
    expect(contrast.getAllByRole('listitem')[0]).toHaveTextContent('Fails AA')
    const before = hexes()
    await user.click(contrast.getByRole('button', { name: 'Make it more readable' }))
    expect(contrast.getAllByRole('listitem')[0]).toHaveTextContent(/Passes/)
    expect(contrast.queryByRole('button', { name: 'Make it more readable' })).not.toBeInTheDocument()
    expect(contrast.getByRole('status')).toHaveTextContent(/Moved the text colour from #A9D0EE/)
    const after = hexes()
    expect(after).not.toEqual(before)
    const blocks: PaletteBlock[] = after.map((hex, index) => ({ id: index + 1, hex, role: unreadable[index].role }))
    const roles = resolveRoles(blocks)
    expect(contrastRatio(hexToRgb(roles.text.hex), hexToRgb(roles.background.hex))).toBeGreaterThanOrEqual(4.5)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(hexes()).toEqual(before)
  })

  it('does not offer Make it more readable when the text already reads', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await showPalettes(user)
    await user.click(cards()[0])
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.queryByRole('button', { name: 'Make it more readable' })).not.toBeInTheDocument()
  })

  it('saves the palette and reports the result when Finish is pressed', async () => {
    const user = userEvent.setup()
    const onFinished = vi.fn()
    render(<Harness onFinished={onFinished} />)
    await showPalettes(user)
    await user.click(cards()[0])
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(window.localStorage.getItem('droplet-project-duckstack-palette')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1))
    const saved = JSON.parse(window.localStorage.getItem('droplet-project-duckstack-palette')!) as { blocks: { hex: string }[] }
    const result = onFinished.mock.calls[0][0] as PaletteResult
    expect(result.kind).toBe('palette')
    expect(result.colours.map((colour) => colour.hex)).toEqual(saved.blocks.map((block) => block.hex))
    expect(result.colours.map((colour) => colour.role).sort()).toEqual(expect.arrayContaining(['accent', 'background', 'primary', 'text']))
    expect(result.level).not.toBe('fail')
  })

  it('keeps the palette and the page mounted when the mode is switched', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Harness mode="guide" />)
    await showPalettes(user)
    await user.click(cards()[2])
    const chosen = hexes()
    const preview = screen.getByRole('region', { name: 'Document preview' })
    rerender(<Harness mode="workspace" />)
    expect(screen.getByRole('region', { name: 'Document preview' })).toBe(preview)
    expect(hexes()).toEqual(chosen)
    // Workspace mode has the colour tools together, with no steps
    expect(screen.getByRole('region', { name: 'The colour tools' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: BRAND_TITLES.colours })).not.toBeInTheDocument()
    rerender(<Harness mode="guide" />)
    expect(screen.getByRole('region', { name: 'Document preview' })).toBe(preview)
    expect(hexes()).toEqual(chosen)
  })
})
