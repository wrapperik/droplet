import { useCallback, useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { starterBlocks } from '../compose/fallback.ts'
import { startBrandGuide, type BrandProgress, type PaletteResult } from '../lib/brandGuide.ts'
import type { PaletteBlock } from '../lib/palette.ts'
import { docOf, openWorkspace, reduce, type WorkspaceAction } from '../lib/workspaceState.ts'
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
    </>
  )
}

const bar = () => screen.getByRole('group', { name: 'Parts of the brand' })
const part = (name: string) => within(bar()).getByRole('button', { name: new RegExp(`^${name}`) })
const hexes = () => screen.getByTestId('hexes').textContent!.split(' ')
const next = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Continue' }))
const changeColour = () => fireEvent.change(screen.getByRole('slider', { name: 'Brightness' }), { target: { value: '50' } })

beforeEach(() => window.localStorage.clear())

describe('the brand workspace in Guide mode', () => {
  it('has the four parts as steps on the task bar, which Workspace mode does not have, and marks the current one as the step', () => {
    const { unmount } = render(<Harness mode="workspace" />)
    expect(screen.queryByRole('group', { name: 'Parts of the brand' })).not.toBeInTheDocument()
    unmount()
    render(<Harness mode="guide" />)
    expect(within(bar()).getAllByRole('button').map((button) => button.querySelector('.taskbar__label')?.textContent)).toEqual(['Colours', 'Typography', 'Voice', 'Brand plan'])
    expect(part('Colours')).toHaveAttribute('aria-current', 'step')
    expect(part('Brand plan')).toHaveAttribute('aria-disabled', 'true')
  })

  it('opens on the colour screen with the same toolbar as Workspace mode, and Back and Continue under it', () => {
    render(<Harness />)
    const toolbar = screen.getByRole('toolbar', { name: 'Palette toolbar' })
    for (const name of ['Undo', 'Redo', 'Generate random', 'Full screen']) expect(within(toolbar).getByRole('button', { name })).toBeInTheDocument()
    expect(screen.getByRole('application', { name: /^Colour wheel for the palette/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
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
    expect(empty.shelf.children).toHaveLength(0)
  })

  it('does not go to a part that has not been reached from the bar', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(part('Brand plan'))
    expect(part('Colours')).toHaveAttribute('aria-current', 'step')
  })

  it('holds Continue back on Colours until the palette is the founder\'s own, and says why', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await next(user)
    expect(screen.getByRole('alert')).toHaveTextContent('Change a colour first')
    changeColour()
    await next(user)
    expect(await screen.findByRole('region', { name: 'Typography' })).toBeInTheDocument()
    expect(part('Typography')).toHaveAttribute('aria-current', 'step')
  })

  it('holds Continue back on Typography until a pair is chosen, then shows six pairs and moves on', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    changeColour()
    await next(user)
    expect(screen.getAllByRole('radio', { name: /with/ })).toHaveLength(6)
    await next(user)
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a pair of typefaces first')
    await user.click(screen.getByRole('radio', { name: /^Editorial: Playfair Display with Inter/ }))
    await next(user)
    expect(await screen.findByRole('region', { name: 'Voice' })).toBeInTheDocument()
  })

  it('lets three voice words be chosen and no more, and holds Continue back with none', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    changeColour()
    await next(user)
    await user.click(screen.getByRole('radio', { name: /^Clean/ }))
    await next(user)
    await next(user)
    expect(screen.getByRole('alert')).toHaveTextContent('Pick at least one word')
    for (const word of ['Warm', 'Bold', 'Calm']) await user.click(screen.getByRole('button', { name: word }))
    expect(screen.getByRole('button', { name: 'Direct' })).toBeDisabled()
    expect(screen.getByText(/Your brand sounds warm, bold and calm\./)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Bold' }))
    expect(screen.getByRole('button', { name: 'Direct' })).toBeEnabled()
  })

  it('ends on a brand plan of the colours, typefaces and voice, with the logo still to do, and Finish saves all of it', async () => {
    const user = userEvent.setup()
    const onFinished = vi.fn()
    render(<Harness onFinished={onFinished} />)
    changeColour()
    await next(user)
    await user.click(screen.getByRole('radio', { name: /^Warm: Fraunces with DM Sans/ }))
    await next(user)
    await user.click(screen.getByRole('button', { name: 'Friendly' }))
    await next(user)
    const plan = await screen.findByRole('region', { name: 'Brand plan' })
    expect(within(plan).getByText('Headings: Fraunces')).toBeInTheDocument()
    expect(within(plan).getByText(/Your brand sounds friendly\./)).toBeInTheDocument()
    expect(within(plan).getByText('Outstanding')).toBeInTheDocument()
    expect(within(plan).getByText(new RegExp(hexes()[0]))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1))
    const saved = JSON.parse(window.localStorage.getItem('droplet-project-duckstack-palette')!) as { fonts?: string; voice?: string[] }
    expect(saved.fonts).toBe('warm')
    expect(saved.voice).toEqual(['Friendly'])
  })

  it('goes back to a part already reached, and forward again', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    changeColour()
    await next(user)
    await user.click(part('Colours'))
    expect(screen.getByRole('application', { name: /^Colour wheel for the palette/ })).toBeInTheDocument()
    await user.click(part('Typography'))
    expect(await screen.findByRole('region', { name: 'Typography' })).toBeInTheDocument()
  })

  it('keeps the palette when the mode is switched', () => {
    const { rerender } = render(<Harness mode="guide" />)
    changeColour()
    const changed = hexes()
    rerender(<Harness mode="workspace" />)
    expect(hexes()).toEqual(changed)
    expect(document.querySelector('.brandgrid')).not.toBeNull()
    rerender(<Harness mode="guide" />)
    expect(hexes()).toEqual(changed)
  })
})
