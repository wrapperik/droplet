import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GalleryIcon, PaletteIcon } from '@solar-icons/react/linear'
import SourceTabs, { type SourceTab } from './SourceTabs.tsx'

const tabs: SourceTab<'a' | 'b' | 'c'>[] = [
  { id: 'a', label: 'Base colour', icon: PaletteIcon },
  { id: 'b', label: 'Image', icon: GalleryIcon },
  { id: 'c', label: 'Colour wheel', icon: PaletteIcon },
]

function Harness({ start = 'c' as 'a' | 'b' | 'c' }) {
  const [value, setValue] = useState(start)
  return <SourceTabs tabs={tabs} value={value} onChange={setValue} label="Where the colours come from" idBase="t" />
}

describe('the source tabs', () => {
  it('shows each tab with its icon and name, and marks the current one', () => {
    render(<Harness />)
    const list = screen.getByRole('tablist', { name: 'Where the colours come from' })
    expect(list.querySelectorAll('[role="tab"]')).toHaveLength(3)
    expect(screen.getByRole('tab', { name: 'Colour wheel' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Image' })).toHaveAttribute('aria-selected', 'false')
    for (const tab of screen.getAllByRole('tab')) expect(tab.querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('tab', { name: 'Colour wheel' })).toHaveAttribute('aria-controls', 't-panel-c')
  })

  it('changes on a press, and only the current tab is in the tab order', async () => {
    render(<Harness />)
    expect(screen.getByRole('tab', { name: 'Colour wheel' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Image' })).toHaveAttribute('tabindex', '-1')
    await userEvent.click(screen.getByRole('tab', { name: 'Image' }))
    expect(screen.getByRole('tab', { name: 'Image' })).toHaveAttribute('aria-selected', 'true')
  })

  it('moves with the arrow keys, round the ends, and with Home and End', async () => {
    render(<Harness />)
    screen.getByRole('tab', { name: 'Colour wheel' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Base colour' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Base colour' })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Colour wheel' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Base colour' })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Colour wheel' })).toHaveFocus()
  })
})
