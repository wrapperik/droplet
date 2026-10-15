import { useCallback, useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { starterBlocks } from '../compose/fallback.ts'
import { BRAND_LEADS, BRAND_PARTS, BRAND_TITLES } from '../lib/brandParts.ts'
import { startBrandGuide, type BrandProgress, type PaletteResult } from '../lib/brandGuide.ts'
import { docOf, openWorkspace, reduce, type WorkspaceAction } from '../lib/workspaceState.ts'
import PaletteWorkspace from './PaletteWorkspace.tsx'

function Harness({ mode = 'workspace', onFinished = () => {} }: { mode?: 'guide' | 'workspace'; onFinished?: (result: PaletteResult) => void }) {
  const [state, setState] = useState(() => openWorkspace(starterBlocks()))
  const [progress, setProgress] = useState<BrandProgress>(startBrandGuide())
  const dispatch = useCallback((action: WorkspaceAction) => setState((current) => reduce(current, action)), [])
  return (
    <>
      <PaletteWorkspace mode={mode} projectId="duckstack" projectName="DuckStack" state={state} dispatch={dispatch} progress={progress} onProgress={setProgress} onFinished={onFinished} />
      <output data-testid="hexes">{docOf(state).blocks.map((block) => block.hex).join(' ')}</output>
    </>
  )
}

const bar = () => screen.getByRole('group', { name: 'Parts of the brand' })
const part = (name: string) => within(bar()).getByRole('button', { name: new RegExp(`^${name}`) })
const hexes = () => screen.getByTestId('hexes').textContent!.split(' ')

beforeEach(() => window.localStorage.clear())

describe('the brand workspace', () => {
  it('has the palette and a sample document on the left, and the three parts of the brand on the right, all at once', () => {
    render(<Harness />)
    expect(within(screen.getByRole('region', { name: 'The palette' })).getByRole('region', { name: 'Document preview' })).toBeInTheDocument()
    const panel = screen.getByRole('region', { name: 'The parts of the brand' })
    for (const id of BRAND_PARTS) {
      const section = within(panel).getByRole('region', { name: BRAND_TITLES[id] })
      expect(section).toHaveAttribute('data-part', id)
      expect(section).toHaveTextContent(BRAND_LEADS[id])
    }
  })

  it('has the three parts on the task bar with their names written out, and Undo, Redo, Save and Export in the header', () => {
    render(<Harness />)
    const buttons = within(bar()).getAllByRole('button')
    expect(buttons.map((button) => button.querySelector('.taskbar__label')?.textContent)).toEqual(['Colours', 'Roles', 'Contrast'])
    for (const name of ['Undo', 'Redo']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export brand sheet' })).toBeInTheDocument()
  })

  it('has nothing to move, resize, hide or reset', () => {
    const { container } = render(<Harness />)
    for (const name of [/Windows/, /Reset layout/, /Add or remove/, /drag/i]) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    expect(container.querySelector('[draggable="true"], .gw__item')).toBeNull()
  })

  it('ticks Contrast on the starter palette, whose text reads on its background, and leaves Colours and Roles open until the palette is the founder\'s own', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(part('Contrast')).toHaveTextContent('complete')
    expect(part('Contrast')).not.toHaveTextContent('not complete')
    expect(part('Colours')).toHaveTextContent('not complete yet')
    expect(part('Roles')).toHaveTextContent('not complete yet')
    await user.click(screen.getByRole('button', { name: /^Remove colour 4,/ }))
    expect(part('Colours')).not.toHaveTextContent('not complete')
  })

  it('goes to a part when it is pressed on the bar, and marks the one in view', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(part('Roles'))
    expect(part('Roles')).toHaveAttribute('aria-current', 'location')
    expect(part('Colours')).not.toHaveAttribute('aria-current')
    await user.click(part('Colours'))
    expect(part('Colours')).toHaveAttribute('aria-current', 'location')
    // the first field of Colours takes the cursor: the colour wheel's controls are the first inputs in the part
    expect(screen.getByRole('region', { name: 'Colours' }).contains(document.activeElement)).toBe(true)
  })

  it('changes the selected colour from its hex field and from its red, green and blue fields', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const colours = within(screen.getByRole('region', { name: 'Colours' }))
    const hex = colours.getByLabelText('Hex')
    await user.clear(hex)
    await user.type(hex, '#AA3355')
    expect(hexes()[0]).toBe('#AA3355')
    const red = colours.getByLabelText('Red')
    await user.clear(red)
    await user.type(red, '17')
    expect(hexes()[0]).toBe('#113355')
    // half a number is not applied, and more than 255 is not a colour
    await user.clear(red)
    await user.type(red, '300')
    expect(hexes()[0]).not.toBe('#FF3355')
  })

  it('shows a Generate button and the harmonies, and Generate changes the colours that are not kept', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const colours = within(screen.getByRole('region', { name: 'Colours' }))
    expect(colours.getByRole('radiogroup', { name: 'Harmony' })).toBeInTheDocument()
    const before = hexes()
    await user.click(colours.getByRole('button', { name: 'Generate' }))
    expect(hexes()[0]).toBe(before[0])
    expect(hexes()).not.toEqual(before)
  })

  it('shows each key pair of Contrast with its ratio and a word and an icon, never colour alone', () => {
    render(<Harness />)
    const contrast = within(screen.getByRole('region', { name: 'Contrast' }))
    const rows = contrast.getAllByRole('listitem')
    expect(rows.map((row) => row.querySelector('.contrast__label')?.textContent)).toEqual(['Text on background', 'Primary on background', 'Accent on background'])
    for (const row of rows) {
      expect(row.textContent).toMatch(/\d+\.\d:1/)
      expect(row.textContent).toMatch(/Passes (AA|AAA)|Fails AA/)
      expect(row.querySelector('.badge__dot svg')).not.toBeNull()
    }
    expect(rows[0]).toHaveTextContent(/Passes/)
  })

  it('fails the text on the background in words, and takes the tick from Contrast, when it cannot be read', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    // the text colour is made almost the same as the background
    const text = starterBlocks().findIndex((block) => block.role === 'text')
    await user.click(within(screen.getByRole('region', { name: 'The palette' })).getByRole('radio', { name: new RegExp(`^Colour ${text + 1},`) }))
    const hex = within(screen.getByRole('region', { name: 'Colours' })).getByLabelText('Hex')
    await user.clear(hex)
    await user.type(hex, '#D5ECFB')
    const contrast = within(screen.getByRole('region', { name: 'Contrast' }))
    expect(contrast.getAllByRole('listitem')[0]).toHaveTextContent('Fails AA')
    expect(part('Contrast')).toHaveTextContent('not complete yet')
  })

  it('has the four roles as cards, and choosing a role gives the selected colour that role', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const roles = within(screen.getByRole('region', { name: 'Roles' }))
    expect(roles.getAllByRole('listitem')).toHaveLength(4)
    await user.click(roles.getAllByRole('button', { name: /^Use colour 1$/ })[0])
    expect(roles.getAllByRole('button', { name: /^Colour 1$/ })).toHaveLength(1)
    expect(roles.getByRole('button', { name: /^Colour 1$/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not save until Save is pressed, and keeps only the colours', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(await screen.findByText('Not saved yet')).toBeInTheDocument()
    expect(window.localStorage.getItem('droplet-project-duckstack-palette')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const saved = JSON.parse(window.localStorage.getItem('droplet-project-duckstack-palette')!) as Record<string, unknown>
    expect(Object.keys(saved).sort()).toEqual(['blocks', 'savedAt'])
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
  })
})
