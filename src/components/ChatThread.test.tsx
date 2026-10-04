import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
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
    // one outline for the blob and one for the hole: the bands only repeat the mark, they draw nothing of their own
    expect(container.querySelectorAll('path')).toHaveLength(2)
    expect(container.querySelectorAll('circle')).toHaveLength(0)
    expect(container.querySelectorAll('.loader__ripple, .loader__drop')).toHaveLength(0)
  })

  it('ripples the whole mark: every band shows the same mark, behind a window of its own', () => {
    const { container } = render(<DropletLoader />)
    const bands = [...container.querySelectorAll('.loader__band')]
    expect(bands).toHaveLength(32)
    const mark = container.querySelector('.loader__body')!.id
    for (const band of bands) expect(band.querySelector('use')!.getAttribute('href')).toBe(`#${mark}`)
    // the window is on the outside, so it stays put while the mark slides behind it
    for (const band of bands) expect(band.parentElement).toHaveAttribute('clip-path')
    expect(container.querySelectorAll('clipPath')).toHaveLength(32)
    // the bands are numbered down the mark, which is what makes the wave travel
    expect(bands.map((band) => (band as HTMLElement).style.getPropertyValue('--band'))).toEqual(bands.map((_, index) => String(index)))
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
    // and its own bands and mark, so one loader never clips or copies another
    const all = [...container.querySelectorAll('[id]')].map((element) => element.id)
    expect(new Set(all).size).toBe(all.length)
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

describe('ChatThread dividers and actions', () => {
  it('draws a divider as a line with words on it, not as a message from anyone', () => {
    const { container } = render(<ChatThread messages={[{ id: 1, from: 'divider', text: 'Switched workspace to Invoice' }]} />)
    expect(container.querySelector('.thread__divider')).toHaveTextContent('Switched workspace to Invoice')
    expect(screen.queryByText('You:')).toBeNull()
    expect(screen.queryByText('Droplet:')).toBeNull()
  })

  it('shows the buttons a message carries, and says which message and which button was pressed', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<ChatThread messages={[{ id: 7, from: 'droplet', text: 'Save first?', actions: [{ id: 'save', label: 'Save it', primary: true }, { id: 'leave', label: 'Leave' }] }]} onAction={onAction} />)
    await user.click(screen.getByRole('button', { name: 'Leave' }))
    expect(onAction).toHaveBeenCalledWith(7, 'leave')
    expect(screen.getByRole('button', { name: 'Save it' })).toHaveClass('thread__action--primary')
  })

  it('shows no buttons once a message has none left', () => {
    render(<ChatThread messages={[{ id: 7, from: 'droplet', text: 'Done.', actions: [] }]} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('Droplet\'s messages laid out', () => {
  const answer = 'Three ways to price a box:\n\n- **Cost plus**: your costs and a margin.\n- **Value based**: what it is worth to them.\n\nThen:\n\n1. Work out your costs.\n2. Pick a margin.'

  it('draws lists as lists, with the bold words bold', () => {
    const { container } = render(<ChatThread messages={[{ id: 1, from: 'droplet', text: answer }]} />)
    const bullets = container.querySelector('.rich ul')!
    expect(within(bullets as HTMLElement).getAllByRole('listitem')).toHaveLength(2)
    expect(container.querySelector('.rich ul strong')).toHaveTextContent('Cost plus')
    expect(container.querySelector('.rich ol')).toHaveStyle({ counterReset: 'rich-step 0' })
    expect(container.querySelectorAll('.rich ol li')).toHaveLength(2)
    expect(container.querySelectorAll('.rich p')).toHaveLength(2)
  })

  it('never turns a message into markup', () => {
    const { container } = render(<ChatThread messages={[{ id: 1, from: 'droplet', text: '<img src=x onerror=alert(1)> and <b>bold</b>' }]} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument()
  })

  it('leaves the founder\'s own words as they typed them', () => {
    const { container } = render(<ChatThread messages={[{ id: 1, from: 'you', text: '- not a list **not bold**' }]} />)
    expect(container.querySelector('ul')).toBeNull()
    expect(container.querySelector('strong')).toBeNull()
    expect(screen.getByText('- not a list **not bold**')).toBeInTheDocument()
  })

  it('sets the question apart from the answer, after it', () => {
    const { container } = render(<ChatThread messages={[{ id: 1, from: 'droplet', text: 'Start from your costs.', question: 'What does one box cost you?' }]} />)
    const bubble = container.querySelector('.thread__message--droplet')!
    expect(bubble.querySelector('.thread__question')).toHaveTextContent('What does one box cost you?')
    expect(bubble.querySelector('.rich')!.nextElementSibling).toHaveClass('thread__question')
  })

  it('offers the replies under the newest message, and sends the one that is tapped', async () => {
    const user = userEvent.setup()
    const onReply = vi.fn()
    render(<ChatThread onReply={onReply} messages={[{ id: 1, from: 'droplet', text: 'Hello.', question: 'Ready?', replies: ['Yes, go ahead', 'Not yet'] }]} />)
    const group = screen.getByRole('list', { name: 'Suggested replies' })
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['Yes, go ahead', 'Not yet'])
    await user.click(screen.getByRole('button', { name: 'Not yet' }))
    expect(onReply).toHaveBeenCalledWith('Not yet')
  })

  it('takes the replies away once the conversation moves on, or while a reply is pending', () => {
    const asked: ThreadMessage = { id: 1, from: 'droplet', text: 'Hello.', question: 'Ready?', replies: ['Yes'] }
    const { rerender } = render(<ChatThread messages={[asked, { id: 2, from: 'you', text: 'Yes' }]} />)
    expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull()
    rerender(<ChatThread messages={[asked, { id: 2, from: 'you', text: 'Yes' }, { id: 3, from: 'droplet', text: '', pending: true }]} />)
    expect(screen.queryByRole('list', { name: 'Suggested replies' })).toBeNull()
    rerender(<ChatThread messages={[{ ...asked, text: '', pending: true }]} />)
    expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull()
  })

  it('offers no replies without a question to answer', () => {
    render(<ChatThread messages={[{ id: 1, from: 'droplet', text: 'Hello.', replies: ['Yes'] }]} />)
    expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull()
  })
})
