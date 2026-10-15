import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AskContext } from './AskContext.tsx'
import PaletteCanvas from './PaletteCanvas.tsx'
// The stylesheets are read as text, since the tests render without them.
// @ts-expect-error node:fs has no types in the app's config
const { readFileSync } = (await import('node:fs')) as { readFileSync: (path: string, encoding: string) => string }
const css = readFileSync('src/components/PaletteCanvas.css', 'utf8')

const blocks = [
  { id: 1, hex: '#D6FB00', name: 'Bright lime', role: 'primary' as const },
  { id: 2, hex: '#005458', name: 'Deep teal', role: 'accent' as const },
]

const setup = () => {
  const props = { blocks, selectedId: 1, max: 8, min: 1, onSelect: vi.fn(), onAdd: vi.fn(), onRemove: vi.fn(), onToggleLock: vi.fn(), onToggleStar: vi.fn(), reason: 'The palette.' }
  const view = render(
    <AskContext.Provider value={{ ask: vi.fn(), busy: false }}>
      <PaletteCanvas {...props} />
    </AskContext.Provider>,
  )
  return { ...view, props }
}

describe('the actions on a colour block', () => {
  it('are in one row of their own: keep, keep in mind, ask, copy and remove, so nothing can sit on top of anything else', () => {
    const { container } = setup()
    const row = container.querySelectorAll<HTMLElement>('.palette__actions')[0]
    const names = within(row).getAllByRole('button').map((button) => button.getAttribute('aria-label'))
    expect(names).toEqual(['Keep colour 1, #D6FB00, when generating', 'Keep colour 1, #D6FB00, in mind', 'Ask Droplet about colour 1', 'Copy #D6FB00', 'Remove colour 1, #D6FB00'])
    // no button of the block is placed outside the row
    expect(container.querySelector('.palette__copy')).toBeNull()
  })

  it('has the ask button only on the selected colour', () => {
    const { container } = setup()
    const rows = container.querySelectorAll<HTMLElement>('.palette__actions')
    expect(within(rows[0]).queryByRole('button', { name: /Ask Droplet/ })).toBeInTheDocument()
    expect(within(rows[1]).queryByRole('button', { name: /Ask Droplet/ })).not.toBeInTheDocument()
  })

  it('still copies the hex code and removes a colour', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const { props } = setup()
    await user.click(screen.getByRole('button', { name: 'Copy #D6FB00' }))
    expect(writeText).toHaveBeenCalledWith('#D6FB00')
    expect(await screen.findByText('Hex value copied.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove colour 2, #005458' }))
    expect(props.onRemove).toHaveBeenCalledWith(2)
  })
})

describe('how the colour blocks are laid out', () => {
  it('gives the titles and the check way to the actions while a block is pointed at, so they never overlap', () => {
    expect(css).toMatch(/\.palette__cell:hover \.palette__top[^{]*\{\s*opacity:\s*0/)
    expect(css).toMatch(/\.palette__cell:has\(\.palette__action:focus-visible\) \.palette__top/)
  })

  it('shows four blocks across only when each is wide enough for the row of actions, and three or two across below that', () => {
    expect(css).toMatch(/@container \(max-width: 46rem\)\s*\{\s*\.palette__grid\s*\{\s*grid-template-columns:\s*repeat\(3/)
    expect(css).toMatch(/@container \(max-width: 33rem\)\s*\{\s*\.palette__grid\s*\{\s*grid-template-columns:\s*repeat\(2/)
    expect(css).toMatch(/\.palette__grid\s*\{[^}]*repeat\(4/)
  })

  it('puts the actions in a row along the top, wrapping, and lets presses through where the row is empty', () => {
    expect(css).toMatch(/\.palette__actions\s*\{[^}]*left:\s*0\.5rem[^}]*flex-wrap:\s*wrap[^}]*pointer-events:\s*none/)
    expect(css).toMatch(/\.palette__actions > \*\s*\{\s*pointer-events:\s*auto/)
  })

  it('gives a touch screen a row of its own, where the actions are always on show, so they do not lie over the titles', () => {
    expect(css).toMatch(/@media \(hover: none\)\s*\{[\s\S]*\.palette__grid\s*\{\s*grid-auto-rows:\s*9\.75rem[\s\S]*\.palette__block\s*\{\s*padding-top:\s*2\.75rem/)
  })
})
