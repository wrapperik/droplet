import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { resolveRoles, type PaletteBlock } from '../lib/palette.ts'
import { AskContext } from './AskContext.tsx'
import SwatchStrip from './SwatchStrip.tsx'
// The stylesheet is read as text, since the tests render without it.
// @ts-expect-error node:fs has no types in the app's config
const { readFileSync } = (await import('node:fs')) as { readFileSync: (path: string, encoding: string) => string }
const css = readFileSync('src/components/SwatchStrip.css', 'utf8')

const blocks: PaletteBlock[] = [
  { id: 1, hex: '#D6FB00', name: 'Bright lime', role: 'primary' },
  { id: 2, hex: '#005458' },
  { id: 3, hex: '#F4F8FB' },
]

const setup = (over: Partial<React.ComponentProps<typeof SwatchStrip>> = {}) => {
  const props = {
    blocks,
    roles: resolveRoles(blocks),
    selectedId: 1,
    max: 8,
    min: 2,
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onToggleLock: vi.fn(),
    onToggleStar: vi.fn(),
    ...over,
  }
  const view = render(
    <AskContext.Provider value={{ ask: vi.fn(), busy: false }}>
      <SwatchStrip {...props} />
    </AskContext.Provider>,
  )
  return { ...view, props }
}

describe('the palette as pills', () => {
  it('has a pill for each colour with its hex code under it, and says which one is selected', () => {
    const { container } = setup()
    const pills = container.querySelectorAll('.strip__pill')
    expect(pills).toHaveLength(3)
    expect([...container.querySelectorAll('.strip__hex')].map((hex) => hex.textContent)).toEqual(['#D6FB00', '#005458', '#F4F8FB'])
    expect(screen.getByRole('radio', { name: 'Colour 1, Bright lime, #D6FB00, Primary' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Colour 2, #005458' })).not.toBeChecked()
    // the selected one carries a tick as well as a ring, so it is not told apart by colour alone
    expect(pills[0].querySelector('.strip__tick')).not.toBeNull()
    expect(pills[1].querySelector('.strip__tick')).toBeNull()
  })

  it('names the role under the hex: the one chosen, and the one suggested from the colours, in words', () => {
    const { container } = setup()
    const captions = [...container.querySelectorAll('.strip__caption')].filter((caption) => caption.querySelector('.strip__hex'))
    expect(captions[0]).toHaveTextContent('#D6FB00Primary')
    expect(captions[0]).not.toHaveTextContent('suggested')
    // the darkest of the rest is suggested as the text, the palest as the background
    expect(captions[1]).toHaveTextContent(/Text\s*\(suggested\)/)
    expect(captions[2]).toHaveTextContent(/Background\s*\(suggested\)/)
  })

  it('selects a colour when its pill is chosen', async () => {
    const { props } = setup()
    await userEvent.click(screen.getByRole('radio', { name: 'Colour 2, #005458' }))
    expect(props.onSelect).toHaveBeenCalledWith(2)
  })

  it('has the actions of a pill in one column of their own: keep, keep in mind, ask (selected only), copy and remove', () => {
    const { container } = setup()
    const columns = container.querySelectorAll<HTMLElement>('.strip__actions')
    const names = (column: HTMLElement) => within(column).getAllByRole('button').map((button) => button.getAttribute('aria-label'))
    expect(names(columns[0])).toEqual(['Keep colour 1, #D6FB00, when generating', 'Keep colour 1, #D6FB00, in mind', 'Ask Droplet about colour 1', 'Copy #D6FB00', 'Remove colour 1, #D6FB00'])
    expect(names(columns[1])).not.toContain('Ask Droplet about colour 2')
  })

  it('copies the hex code, keeps and removes a colour, and says so aloud', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const { props } = setup()
    await user.click(screen.getByRole('button', { name: 'Copy #D6FB00' }))
    expect(writeText).toHaveBeenCalledWith('#D6FB00')
    expect(await screen.findByText('Hex value copied.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep colour 2, #005458, when generating' }))
    expect(props.onToggleLock).toHaveBeenCalledWith(2)
    await user.click(screen.getByRole('button', { name: 'Keep colour 2, #005458, in mind' }))
    expect(props.onToggleStar).toHaveBeenCalledWith(2)
    await user.click(screen.getByRole('button', { name: 'Remove colour 3, #F4F8FB' }))
    expect(props.onRemove).toHaveBeenCalledWith(3)
    expect(await screen.findByText('Colour 3, #F4F8FB, removed.')).toBeInTheDocument()
  })

  it('shows a kept colour as pressed', () => {
    setup({ blocks: blocks.map((block) => (block.id === 2 ? { ...block, locked: true } : block)) })
    expect(screen.getByRole('button', { name: 'Keep colour 2, #005458, when generating' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Keep colour 1, #D6FB00, when generating' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('does not offer to remove a colour at the minimum', () => {
    setup({ min: 3 })
    expect(screen.queryByRole('button', { name: /^Remove colour/ })).not.toBeInTheDocument()
  })

  it('adds a colour from the control after the last pill, until there are eight', async () => {
    const { props, unmount } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Add colour' }))
    expect(props.onAdd).toHaveBeenCalledOnce()
    unmount()
    const eight = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, hex: '#1F8FE0' }))
    setup({ blocks: eight, roles: resolveRoles(eight) })
    expect(screen.queryByRole('button', { name: 'Add colour' })).not.toBeInTheDocument()
  })
})

describe('how the pills look', () => {
  it('are tall pills with fully rounded ends, with no card round the row', () => {
    expect(css).toMatch(/\.strip__pill\s*\{[^}]*border-radius:\s*var\(--radius-pill\)/)
    expect(css).not.toMatch(/\.strip\s*\{[^}]*(border|box-shadow|background)/)
    expect(css).not.toMatch(/\.strip__row\s*\{[^}]*(box-shadow|background)/)
  })

  it('shows the actions on hover or focus, and always on a touch screen', () => {
    expect(css).toMatch(/\.strip__cell:hover \.strip__action/)
    expect(css).toMatch(/\.strip__actions:focus-within \.strip__action/)
    expect(css).toMatch(/@media \(hover: none\)\s*\{[\s\S]*\.strip__action[\s\S]*opacity:\s*0\.85/)
  })

  it('lets presses through the column of actions where there is no button', () => {
    expect(css).toMatch(/\.strip__actions\s*\{[^}]*pointer-events:\s*none/)
    expect(css).toMatch(/\.strip__actions > \*\s*\{\s*pointer-events:\s*auto/)
  })
})
