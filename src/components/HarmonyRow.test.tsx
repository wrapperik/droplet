import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HARMONY_RULES } from '../lib/harmony.ts'
import HarmonyRow, { HarmonyIcon } from './HarmonyRow.tsx'

afterEach(() => vi.restoreAllMocks())

describe('the row of harmonies', () => {
  it('says which harmony is on, and has a button for each of the eight in order, each with a diagram', () => {
    render(<HarmonyRow harmony="analogous" onChoose={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Colour harmonies: Analogous' })).toBeInTheDocument()
    const row = screen.getByRole('group', { name: 'Harmony rules' })
    const buttons = within(row).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(HARMONY_RULES.map((rule) => rule.label))
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toContain('Double split complementary')
    for (const button of buttons) expect(button.querySelector('svg')).not.toBeNull()
  })

  it('marks the one in use as pressed, in words and not by colour alone', () => {
    render(<HarmonyRow harmony="square" onChoose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Square' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Triad' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('heading', { name: 'Colour harmonies: Square' })).toBeInTheDocument()
  })

  it('chooses a rule when its button is pressed, and says in a line what it is', async () => {
    const onChoose = vi.fn()
    render(<HarmonyRow harmony="custom" onChoose={onChoose} />)
    expect(screen.getByText('No rule. Each colour moves on its own.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Split complementary' }))
    expect(onChoose).toHaveBeenCalledWith('split_complementary')
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(onChoose).toHaveBeenLastCalledWith('custom')
  })

  it('has no arrows when all the rules fit', () => {
    render(<HarmonyRow harmony="triad" onChoose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Show more harmonies' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show earlier harmonies' })).not.toBeInTheDocument()
  })

  it('has a labelled arrow that scrolls the row when the rules do not fit, and one back once it has scrolled', async () => {
    // a row 200px wide with 500px of rules in it
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200)
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(500)
    const scrollBy = vi.fn()
    HTMLElement.prototype.scrollBy = scrollBy as unknown as typeof HTMLElement.prototype.scrollBy
    render(<HarmonyRow harmony="triad" onChoose={() => {}} />)
    const more = await screen.findByRole('button', { name: 'Show more harmonies' })
    expect(screen.queryByRole('button', { name: 'Show earlier harmonies' })).not.toBeInTheDocument()
    await userEvent.click(more)
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }))
    expect(scrollBy.mock.calls[0][0].left).toBeGreaterThan(0)
    // scrolled along: the way back appears
    const row = screen.getByRole('group', { name: 'Harmony rules' })
    row.scrollLeft = 150
    row.dispatchEvent(new Event('scroll'))
    await userEvent.click(await screen.findByRole('button', { name: 'Show earlier harmonies' }))
    expect(scrollBy.mock.calls[1][0].left).toBeLessThan(0)
  })
})

describe('the diagram of a harmony', () => {
  it('draws a dot for each colour of the rule, the starting one larger', () => {
    for (const [harmony, count] of [['complementary', 2], ['triad', 3], ['square', 4], ['double_split', 4], ['monochrome', 3]] as const) {
      const { container, unmount } = render(<HarmonyIcon harmony={harmony} />)
      const dots = container.querySelectorAll('.hicon__dot')
      expect(dots).toHaveLength(count)
      expect(container.querySelectorAll('.hicon__dot--base')).toHaveLength(1)
      unmount()
    }
  })
})
