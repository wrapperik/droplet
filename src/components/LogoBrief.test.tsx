import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BriefBlock } from '../compose/blocks.ts'
import { specColours } from '../lib/logoHandoff.ts'
import ChatBlocks from './ChatBlocks.tsx'

const block: BriefBlock = { type: 'brief', does: 'Curated corporate gift boxes from local makers', feel: ['warm', 'trusted', 'local'], usedFor: 'Invoices and Instagram' }
const colours = specColours({ blocks: [{ hex: '#0e1a2b', role: 'text' }, { hex: '#0b4f8a', role: 'primary' }] })

const setup = (over: Partial<React.ComponentProps<typeof ChatBlocks>> = {}) => {
  const props = { blocks: [block], done: new Set<never>(), brand: { name: 'Kindred Gifting', colours }, onOpenHandoff: vi.fn(), onOpen: vi.fn(), ...over }
  render(<ChatBlocks {...props} />)
  return props
}

let written: string[] = []
beforeEach(() => {
  written = []
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => void written.push(text) } })
})

describe('a logo brief in the chat', () => {
  it('shows the words, and the colours from the saved palette', () => {
    setup()
    const brief = screen.getByRole('region', { name: 'Logo brief' })
    expect(brief).toHaveTextContent('Logo brief for Kindred Gifting')
    expect(brief).toHaveTextContent('Curated corporate gift boxes from local makers')
    expect(brief).toHaveTextContent('warm, trusted, local')
    expect(brief).toHaveTextContent('Text #0E1A2B')
    expect(brief).toHaveTextContent('Primary #0B4F8A')
  })

  it('draws no colour the model wrote, since the block has no place for one', () => {
    setup({ brand: { name: 'Kindred Gifting', colours: [] } })
    expect(screen.getByRole('region', { name: 'Logo brief' })).toHaveTextContent('No palette is saved yet.')
    expect(screen.queryByText(/#[0-9A-F]{6}/i)).not.toBeInTheDocument()
  })

  it('copies the whole brief, with the saved hex codes', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Copy the whole brief' }))
    expect(written[0]).toContain('Logo brief for Kindred Gifting')
    expect(written[0]).toContain('Text #0E1A2B, Primary #0B4F8A')
    expect(written[0]).toContain('The feel: warm, trusted, local')
  })

  it('copies one line on its own', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Copy the feel' }))
    expect(written).toEqual(['warm, trusted, local'])
  })

  it('says so when the clipboard refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => Promise.reject(new Error('no')) } })
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Copy the feel' }))
    expect(await screen.findByText(/Could not copy the feel/)).toBeInTheDocument()
  })

  it('opens the handoff card from its button', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Open the handoff card' }))
    expect(props.onOpenHandoff).toHaveBeenCalled()
  })

  it('offers to build the brand when there is no palette', async () => {
    const props = setup({ brand: { name: '', colours: [] } })
    await userEvent.click(screen.getByRole('button', { name: 'Build the brand first' }))
    expect(props.onOpen).toHaveBeenCalledWith('palette')
  })

  it('gives the logo step of a plan an Open button for the handoff card', async () => {
    const onOpenHandoff = vi.fn()
    const plan: React.ComponentProps<typeof ChatBlocks>['blocks'] = [
      { type: 'checklist', numbered: true, items: [{ label: 'Choose the colours', step: 'palette' }, { label: 'Get a logo', step: 'logo' }] },
    ]
    render(<ChatBlocks blocks={plan} done={new Set()} onOpenHandoff={onOpenHandoff} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open the handoff card for Get a logo' }))
    expect(onOpenHandoff).toHaveBeenCalled()
  })
})
