import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ChatThread, { type ThreadMessage } from './ChatThread.tsx'
import DropletLoader from './DropletLoader.tsx'
import ThinkingDots from './ThinkingDots.tsx'
import JellyLoader from './JellyLoader.tsx'

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

describe('ThinkingDots', () => {
  it('is decoration: hidden from screen readers', () => {
    const { container } = render(<ThinkingDots />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('draws four circles, each with a dot and a ring', () => {
    const { container } = render(<ThinkingDots />)
    expect(container.querySelectorAll('.thinking__circle')).toHaveLength(4)
    expect(container.querySelectorAll('.thinking__dot')).toHaveLength(4)
    expect(container.querySelectorAll('.thinking__outline')).toHaveLength(4)
  })

  it('takes a size', () => {
    const { container } = render(<ThinkingDots size="2rem" />)
    expect(container.firstElementChild).toHaveStyle({ '--thinking-size': '2rem' })
  })
})

describe('JellyLoader', () => {
  it('is decoration: hidden from screen readers', () => {
    const { container } = render(<JellyLoader />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('points its blob at its own filter, so two on screen do not share one', () => {
    const { container } = render(
      <>
        <JellyLoader />
        <JellyLoader />
      </>,
    )
    const ids = [...container.querySelectorAll('filter')].map((filter) => filter.id)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) expect(id).not.toContain(':')
    const used = [...container.querySelectorAll<HTMLElement>('.jelly')].map((jelly) => jelly.style.getPropertyValue('--jelly-filter'))
    expect(used).toEqual(ids.map((id) => `url(#${id})`))
  })
})

describe('ChatThread', () => {
  const messages: ThreadMessage[] = [
    { id: 1, from: 'you', text: 'How should I price my boxes?' },
    { id: 2, from: 'droplet', text: '', pending: true },
  ]

  it('shows the jelly loader and the word "Thinking" while a reply is pending', () => {
    const { container } = render(<ChatThread messages={messages} />)
    expect(screen.getByText('Thinking')).toBeInTheDocument()
    expect(container.querySelector('.thread__message--pending .jelly')).not.toBeNull()
  })

  it('shows the reply, and no loader, once it arrives', () => {
    const { container } = render(<ChatThread messages={[messages[0], { id: 2, from: 'droplet', text: 'Start from your costs.' }]} />)
    expect(screen.getByText('Start from your costs.')).toBeInTheDocument()
    expect(container.querySelector('.jelly')).toBeNull()
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
    const { container } = render(<ChatThread messages={[{ id: 7, from: 'droplet', text: 'Done.', actions: [] }]} />)
    expect(container.querySelector('.thread__action')).toBeNull()
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

describe('a change receipt in the thread', () => {
  const receipt = { heading: 'Changed on the board', lines: [{ mark: '+' as const, text: '2 notes on the board' }], left: [] }

  it('sits under the reply and before its question, and hands the message to Undo this and Show me', async () => {
    const user = userEvent.setup()
    const onUndoReceipt = vi.fn()
    const onShowReceipt = vi.fn()
    const messages: ThreadMessage[] = [{ id: 7, from: 'droplet', text: 'Done.', question: 'Does it feel right?', receipt, receiptLive: { undo: true, show: true } }]
    const { container } = render(<ChatThread messages={messages} onUndoReceipt={onUndoReceipt} onShowReceipt={onShowReceipt} />)
    const card = container.querySelector('.receipt')!
    const question = container.querySelector('.thread__question')!
    expect(card.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Undo this' }))
    await user.click(screen.getByRole('button', { name: 'Show me' }))
    expect(onUndoReceipt).toHaveBeenCalledWith(7)
    expect(onShowReceipt).toHaveBeenCalledWith(7)
  })

  it('has no buttons for a receipt that was kept from an earlier session, and none while the reply is still being worked on', () => {
    render(<ChatThread messages={[{ id: 1, from: 'droplet', text: 'Done.', receipt }]} />)
    expect(screen.getByRole('region', { name: 'Changed on the board' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo this' })).not.toBeInTheDocument()
  })
})

describe('the time and copy under a message', () => {
  it('shows when each message was sent, and a copy button on Droplet’s replies only', () => {
    const at = new Date().toISOString()
    const { container } = render(<ChatThread messages={[{ id: 1, from: 'you', text: 'Hi', at }, { id: 2, from: 'droplet', text: 'Hello.', at }]} />)
    expect(container.querySelectorAll('time.thread__time')).toHaveLength(2)
    expect(container.querySelector('time')).toHaveAttribute('dateTime', at)
    expect(screen.getAllByRole('button', { name: 'Copy reply' })).toHaveLength(1)
  })

  it('copies the reply and its question as plain text', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<ChatThread messages={[{ id: 2, from: 'droplet', text: 'Start from your costs.', question: 'What does a box cost you?' }]} />)
    await user.click(screen.getByRole('button', { name: 'Copy reply' }))
    expect(writeText).toHaveBeenCalledWith('Start from your costs.\n\nWhat does a box cost you?')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('shows nothing for a reply still being worked on', () => {
    const { container } = render(<ChatThread messages={[{ id: 2, from: 'droplet', text: '', pending: true }]} />)
    expect(container.querySelector('.thread__meta')).toBeNull()
  })
})

describe('a message the founder has just sent', () => {
  const messages: ThreadMessage[] = [
    { id: 1, from: 'you', text: 'Earlier' },
    { id: 2, from: 'droplet', text: 'An answer' },
    { id: 3, from: 'you', text: 'Just sent' },
  ]

  it('rises into its place, and nothing else in the thread moves', () => {
    const { container } = render(<ChatThread messages={messages} onAction={() => {}} flight={{ id: 3 }} />)
    const sent = container.querySelector('[data-message-id="3"]')!
    expect(sent).toHaveAttribute('data-rising')
    expect(container.querySelectorAll('[data-rising]')).toHaveLength(1)
    // Its words are on screen from the start: nothing is hidden while it rises.
    expect(screen.getByText('Just sent')).toBeVisible()
  })

  it('rises for a tapped reply as well, which has no bar to come from', () => {
    const { container } = render(<ChatThread messages={messages} onAction={() => {}} flight={{ id: 1 }} />)
    expect(container.querySelector('[data-message-id="1"]')).toHaveAttribute('data-rising')
  })

  it('does not rise when nothing was just sent', () => {
    const { container } = render(<ChatThread messages={messages} onAction={() => {}} />)
    expect(container.querySelectorAll('[data-rising]')).toHaveLength(0)
  })
})

describe('while Droplet works', () => {
  const pendingThread: ThreadMessage[] = [
    { id: 1, from: 'you', text: 'What does CIPC cost?', at: '2026-10-15T09:00:00.000Z' },
    { id: 2, from: 'droplet', text: '', pending: true },
  ]

  it('says "Thinking" until a stage is known', () => {
    render(<ChatThread messages={pendingThread} />)
    expect(screen.getByText('Thinking')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
  })

  it('shows the stage in words, and the seconds drawn but not read out', () => {
    render(<ChatThread messages={pendingThread} progress={{ words: 'Searched the web for “CIPC fee”. Checking the reply', elapsed: '7s' }} />)
    expect(screen.getByText('Searched the web for “CIPC fee”. Checking the reply')).toBeInTheDocument()
    const seconds = screen.getByText('· 7s')
    expect(seconds).toHaveAttribute('aria-hidden', 'true')
  })

  it('offers Stop, and calls it', async () => {
    const onStop = vi.fn()
    render(<ChatThread messages={pendingThread} onStop={onStop} />)
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onStop).toHaveBeenCalled()
  })
})

describe('a reply that has just arrived', () => {
  const reply = (fresh: boolean): ThreadMessage[] => [
    { id: 1, from: 'you', text: 'Hello', at: '2026-10-15T09:00:00.000Z' },
    { id: 2, from: 'droplet', text: 'First paragraph.\n\nSecond paragraph.', question: 'Which one?', replies: ['This one', 'That one'], ...(fresh ? { fresh: true } : {}), at: '2026-10-15T09:00:05.000Z' },
  ]

  it('comes in paragraph by paragraph, then its question and its suggested replies, each with its place in the order', () => {
    const { container } = render(<ChatThread messages={reply(true)} />)
    const paragraphs = [...container.querySelectorAll('.rich > [data-reveal]')]
    expect(paragraphs.map((node) => (node as HTMLElement).style.getPropertyValue('--i'))).toEqual(['0', '1'])
    expect((container.querySelector('.thread__question') as HTMLElement).style.getPropertyValue('--i')).toBe('4')
    expect((container.querySelector('.thread__replies') as HTMLElement).style.getPropertyValue('--i')).toBe('5')
  })

  it('is shown plainly once it is no longer fresh, so a thread mounted again does not play it again', () => {
    const { container } = render(<ChatThread messages={reply(false)} />)
    expect(container.querySelectorAll('[data-reveal]')).toHaveLength(0)
  })
})

describe('trying again and editing', () => {
  const exchange: ThreadMessage[] = [
    { id: 1, from: 'you', text: 'How should I price a gift box?', at: '2026-10-15T09:00:00.000Z' },
    { id: 2, from: 'droplet', text: 'Start from your costs.', at: '2026-10-15T09:00:05.000Z' },
  ]

  it('offers Try again on the last reply, and calls it with that reply', async () => {
    const onRetry = vi.fn()
    render(<ChatThread messages={exchange} onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledWith(2)
  })

  it('offers neither on a reply that changed a workspace, on one with buttons, on a note from the app, or while Droplet is working', () => {
    const receipt = { heading: 'Changed on the board', lines: [], left: [] } as unknown as ThreadMessage['receipt']
    const cases: ThreadMessage[][] = [
      [exchange[0], { ...exchange[1], receipt }],
      [exchange[0], { ...exchange[1], actions: [{ id: 'save', label: 'Save' }] }],
      [exchange[0], { ...exchange[1], local: true }],
    ]
    for (const thread of cases) {
      const { unmount } = render(<ChatThread messages={thread} onRetry={vi.fn()} onEdit={vi.fn()} />)
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit your message' })).not.toBeInTheDocument()
      unmount()
    }
    render(<ChatThread messages={exchange} onRetry={vi.fn()} onEdit={vi.fn()} busy />)
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('offers Edit on the message the last reply answered, and sends the edit', async () => {
    const onEdit = vi.fn()
    render(<ChatThread messages={exchange} onEdit={onEdit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit your message' }))
    const field = screen.getByRole('textbox', { name: 'Edit your message' })
    expect(field).toHaveValue('How should I price a gift box?')
    await userEvent.clear(field)
    await userEvent.type(field, 'How should I price a corporate gift box?')
    await userEvent.click(screen.getByRole('button', { name: 'Send again' }))
    expect(onEdit).toHaveBeenCalledWith(1, 'How should I price a corporate gift box?')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('leaves the message as it was on Cancel or Escape, and will not send an empty one', async () => {
    const onEdit = vi.fn()
    render(<ChatThread messages={exchange} onEdit={onEdit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit your message' }))
    await userEvent.clear(screen.getByRole('textbox'))
    expect(screen.getByRole('button', { name: 'Send again' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('How should I price a gift box?')).toBeInTheDocument()
    expect(onEdit).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Edit your message' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
