import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import BrandToolbar from './BrandToolbar.tsx'

const setup = (over: Partial<React.ComponentProps<typeof BrandToolbar>> = {}) => {
  const props: React.ComponentProps<typeof BrandToolbar> = {
    history: { canUndo: true, canRedo: false, undo: vi.fn(), redo: vi.fn() },
    download: <button type="button">Download brand sheet</button>,
    name: 'My colour theme',
    onName: vi.fn(),
    nameProblem: null,
    canSave: true,
    unsaved: true,
    onSave: vi.fn(),
    status: 'Not saved yet',
    palettes: [],
    onOpenPalette: vi.fn(),
    onForgetPalette: vi.fn(),
    canRandom: true,
    onRandom: vi.fn(),
    fullscreen: false,
    onFullscreen: vi.fn(),
    ...over,
  }
  render(<BrandToolbar {...props} />)
  return props
}

const toolbar = () => screen.getByRole('toolbar', { name: 'Palette toolbar' })

describe('the brand toolbar', () => {
  it('has Download, Save, the palette name and Saved palettes on the left, and Undo, Redo, Generate random and Full screen on the right', () => {
    setup()
    const names = within(toolbar())
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent)
    expect(names).toEqual(['Download brand sheet', 'Save', 'Saved palettes', 'Undo', 'Redo', 'Generate random', 'Full screen'])
    expect(screen.getByRole('textbox', { name: 'Palette name' })).toHaveValue('My colour theme')
  })

  it('says where saving stands, quietly', () => {
    setup({ status: 'Unsaved changes' })
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes')
  })

  it('saves when Save is pressed, and changes the name as it is typed', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(props.onSave).toHaveBeenCalledOnce()
    await userEvent.type(screen.getByRole('textbox', { name: 'Palette name' }), 'x')
    expect(props.onName).toHaveBeenLastCalledWith('My colour themex')
  })

  it('shows Save as saved when nothing has changed, and can still save again', async () => {
    const props = setup({ unsaved: false })
    await userEvent.click(screen.getByRole('button', { name: 'Saved' }))
    expect(props.onSave).toHaveBeenCalledOnce()
  })

  it('holds Save back, and says why as an alert, when the name cannot be used', () => {
    setup({ name: '', nameProblem: 'Give the palette a name.' })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Give the palette a name.')
    expect(screen.getByRole('textbox', { name: 'Palette name' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('textbox', { name: 'Palette name' })).toHaveAccessibleDescription('Give the palette a name.')
  })

  it('waits to save until what was saved has been read', () => {
    setup({ canSave: false })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('has Undo and Redo that are disabled when there is nothing to undo or redo, and work when there is', async () => {
    const props = setup()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(props.history.undo).toHaveBeenCalledOnce()
  })

  it('generates a random palette, and is switched off, with the reason, when every colour is kept', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Generate random' }))
    expect(props.onRandom).toHaveBeenCalledOnce()
  })

  it('says why Generate random is off when every colour is kept', () => {
    setup({ canRandom: false })
    const button = screen.getByRole('button', { name: 'Generate random' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringContaining('Every colour is kept'))
  })

  it('has a Full screen button that is pressed when it is on, and whose name changes', async () => {
    const props = setup()
    const off = screen.getByRole('button', { name: 'Full screen' })
    expect(off).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(off)
    expect(props.onFullscreen).toHaveBeenCalledOnce()
  })

  it('is named Exit full screen, and pressed, while it is on', () => {
    setup({ fullscreen: true })
    expect(screen.getByRole('button', { name: 'Exit full screen' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Full screen' })).not.toBeInTheDocument()
  })
})

describe('how the toolbar looks', () => {
  // The stylesheet is read as text, since the tests render without it.
  it('is a flat row of glass pills, with no container round the row', async () => {
    // @ts-expect-error node:fs has no types in the app's config
    const { readFileSync } = (await import('node:fs')) as { readFileSync: (path: string, encoding: string) => string }
    const css = readFileSync('src/components/BrandToolbar.css', 'utf8')
    expect(css).toMatch(/\.btool__pill\s*\{[^}]*border-radius:\s*var\(--radius-pill\)/)
    expect(css).toMatch(/backdrop-filter:\s*blur\(var\(--glass-blur\)\)/)
    expect(css).not.toMatch(/\.btool\s*\{[^}]*(background|border|box-shadow)/)
    expect(css).not.toMatch(/\.btool__row\s*\{[^}]*(background|border|box-shadow)/)
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
