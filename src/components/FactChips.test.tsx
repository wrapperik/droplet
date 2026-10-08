import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import FactChips from './FactChips.tsx'

describe('the facts Droplet offers to remember', () => {
  it('shows a new fact with what it is about, and Remember and Not now beside it', async () => {
    const user = userEvent.setup()
    const onRemember = vi.fn()
    const onNotNow = vi.fn()
    render(<FactChips proposals={[{ key: 'profile.what', value: 'DuckStack builds full-stack software for SMEs' }]} onRemember={onRemember} onNotNow={onNotNow} />)
    expect(screen.getByText('Remember: DuckStack builds full-stack software for SMEs')).toBeInTheDocument()
    expect(screen.getByText('What it does')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Remember: What it does/ }))
    await user.click(screen.getByRole('button', { name: /^Not now/ }))
    expect(onRemember).toHaveBeenCalledWith('profile.what')
    expect(onNotNow).toHaveBeenCalledWith('profile.what')
  })

  it('shows what is there and what it would become when a fact would change one, and offers Update or Keep the old', async () => {
    const user = userEvent.setup()
    const onRemember = vi.fn()
    const onNotNow = vi.fn()
    render(<FactChips proposals={[{ key: 'profile.who_for', value: 'Corporate clients', was: 'Any small business' }]} onRemember={onRemember} onNotNow={onNotNow} />)
    expect(screen.getByText('Update who it is for.')).toBeInTheDocument()
    expect(screen.getByText('Was: Any small business.')).toBeInTheDocument()
    expect(screen.getByText('Now: Corporate clients.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Update/ }))
    await user.click(screen.getByRole('button', { name: /^Keep the old/ }))
    expect(onRemember).toHaveBeenCalledWith('profile.who_for')
    expect(onNotNow).toHaveBeenCalledWith('profile.who_for')
  })

  it('draws nothing when there is nothing to offer', () => {
    const { container } = render(<FactChips proposals={[]} onRemember={() => undefined} onNotNow={() => undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is a list a screen reader can name, with a button per fact that says which fact', () => {
    render(<FactChips proposals={[{ key: 'profile.where', value: 'Pretoria East' }, { key: 'brand.voice', value: 'Warm and plain' }]} onRemember={() => undefined} onNotNow={() => undefined} />)
    expect(screen.getByRole('list', { name: 'Facts Droplet can remember' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Remember: Where it is, Pretoria East' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not now: How it sounds' })).toBeInTheDocument()
  })
})
