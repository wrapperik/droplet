import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { NamedPalette } from '../lib/namedPalettes.ts'
import SavedPalettes from './SavedPalettes.tsx'

const entry = (id: string, name: string, savedAt: string, hex = '#1F8FE0'): NamedPalette => ({ id, name, savedAt, blocks: [{ id: 1, hex }, { id: 2, hex: '#0E1A2B' }] })
const palettes = [entry('a', 'Spring', '2026-10-01T10:00:00.000Z'), entry('b', 'Summer', '2026-10-05T10:00:00.000Z', '#B5543A')]

const setup = (over: Partial<React.ComponentProps<typeof SavedPalettes>> = {}) => {
  const props = { palettes, unsaved: false, onOpen: vi.fn(), onForget: vi.fn(), ...over }
  render(<SavedPalettes {...props} />)
  return props
}
const open = async () => userEvent.click(screen.getByRole('button', { name: /^Saved palettes/ }))

describe('the saved palettes popover', () => {
  it('is closed until the button is pressed, and says it opens a dialog', async () => {
    setup()
    const button = screen.getByRole('button', { name: /^Saved palettes/ })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await open()
    expect(screen.getByRole('dialog', { name: 'Saved palettes' })).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('lists the palettes newest first, each with its colours, name and date', async () => {
    setup()
    await open()
    const rows = within(screen.getByRole('dialog')).getAllByRole('listitem')
    expect(rows.map((row) => row.querySelector('.saved__name')?.textContent)).toEqual(['Summer', 'Spring'])
    expect(rows[0]).toHaveTextContent('Kept 5 Oct')
    expect(rows[0].querySelectorAll('.saved__swatches span')).toHaveLength(2)
  })

  it('says how many are kept on the button, and what to do when there are none', async () => {
    const { unmount } = (() => {
      const view = render(<SavedPalettes palettes={palettes} unsaved={false} onOpen={() => {}} onForget={() => {}} />)
      return view
    })()
    expect(screen.getByRole('button', { name: /^Saved palettes/ })).toHaveTextContent('2')
    unmount()
    setup({ palettes: [] })
    await open()
    expect(screen.getByRole('dialog')).toHaveTextContent('No palettes are saved yet. Name your palette and press Save to keep it here.')
  })

  it('opens a palette and closes, when nothing on screen is unsaved', async () => {
    const props = setup()
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Open Spring' }))
    expect(props.onOpen).toHaveBeenCalledWith(palettes[0])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Saved palettes/ })).toHaveFocus()
  })

  it('asks first when the palette on screen has unsaved changes, and opens only on Open anyway', async () => {
    const props = setup({ unsaved: true })
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Open Spring' }))
    expect(props.onOpen).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('has changes that are not saved')
    await userEvent.click(screen.getByRole('button', { name: 'Keep working' }))
    expect(props.onOpen).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Open Spring' }))
    await userEvent.click(screen.getByRole('button', { name: 'Open anyway' }))
    expect(props.onOpen).toHaveBeenCalledWith(palettes[0])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('forgets a palette only after asking twice', async () => {
    const props = setup()
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Forget Spring' }))
    expect(props.onForget).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Forget Spring?')
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(props.onForget).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Forget Spring' }))
    await userEvent.click(screen.getByRole('button', { name: 'Forget it' }))
    expect(props.onForget).toHaveBeenCalledWith(palettes[0])
  })

  it('closes on Escape and on a press outside', async () => {
    setup()
    await open()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await open()
    await userEvent.click(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is marked as a layer, so Escape in it does not also leave full screen', async () => {
    setup()
    await open()
    expect(screen.getByRole('dialog')).toHaveAttribute('data-layer')
  })
})
