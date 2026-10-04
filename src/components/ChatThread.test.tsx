import { render, screen } from '@testing-library/react'
import ChatThread, { type ThreadMessage } from './ChatThread.tsx'
import DropletLoader from './DropletLoader.tsx'

describe('DropletLoader', () => {
  it('is decoration: hidden from screen readers and not focusable', () => {
    const { container } = render(<DropletLoader />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
  })

  it('draws only the mark and its hole: nothing else is added to the logo', () => {
    const { container } = render(<DropletLoader />)
    expect(container.querySelectorAll('.loader__body')).toHaveLength(1)
    expect(container.querySelectorAll('.loader__hole')).toHaveLength(1)
    // one outline for the blob, one for the hole, and the mask's white backing
    expect(container.querySelectorAll('path')).toHaveLength(2)
    expect(container.querySelectorAll('circle')).toHaveLength(0)
    expect(container.querySelectorAll('.loader__ripple, .loader__drop')).toHaveLength(0)
  })

  it('gives each loader its own mask, so two on screen do not share a hole', () => {
    const { container } = render(
      <>
        <DropletLoader />
        <DropletLoader />
      </>,
    )
    const ids = [...container.querySelectorAll('mask')].map((mask) => mask.id)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) expect(id).not.toContain(':')
    for (const body of container.querySelectorAll('.loader__body')) {
      expect(ids).toContain(body.getAttribute('mask')!.replace(/^url\(#|\)$/g, ''))
    }
  })

  it('takes a size', () => {
    const { container } = render(<DropletLoader size="5rem" />)
    expect(container.querySelector('svg')).toHaveStyle({ width: '5rem' })
  })
})

describe('ChatThread', () => {
  const messages: ThreadMessage[] = [
    { id: 1, from: 'you', text: 'How should I price my boxes?' },
    { id: 2, from: 'droplet', text: '', pending: true },
  ]

  it('shows the loader and the word "Thinking" while a reply is pending', () => {
    const { container } = render(<ChatThread messages={messages} />)
    expect(screen.getByText('Thinking')).toBeInTheDocument()
    expect(container.querySelector('.thread__message--pending .loader')).not.toBeNull()
  })

  it('shows the reply, and no loader, once it arrives', () => {
    const { container } = render(<ChatThread messages={[messages[0], { id: 2, from: 'droplet', text: 'Start from your costs.' }]} />)
    expect(screen.getByText('Start from your costs.')).toBeInTheDocument()
    expect(container.querySelector('.loader')).toBeNull()
    expect(screen.queryByText('Thinking')).toBeNull()
  })

  it('says who spoke, for screen readers', () => {
    render(<ChatThread messages={messages} />)
    expect(screen.getByText('You:')).toBeInTheDocument()
    expect(screen.getByText('Droplet:')).toBeInTheDocument()
  })
})
