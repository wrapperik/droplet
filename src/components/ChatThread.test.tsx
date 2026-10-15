import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ChatThread, { type ThreadMessage } from './ChatThread.tsx'
import { SHOW_SUGGESTED_REPLIES, exchangesOf } from './threadPages.ts'
import DiamondLoader from './DiamondLoader.tsx'

describe('DiamondLoader', () => {
  it('is decoration: hidden from screen readers and not focusable, since the words beside it say what is happening', () => {
    const { container } = render(<DiamondLoader />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('is eight squares in a diamond, each lit a tenth of a second after the one before', () => {
    const { container } = render(<DiamondLoader />)
    const squares = [...container.querySelectorAll<SVGRectElement>('.diamond__square')]
    expect(squares).toHaveLength(8)
    expect(squares.map((square) => square.style.getPropertyValue('--i'))).toEqual(['0', '1', '2', '3', '4', '5', '6', '7'])
    expect(squares.map((square) => `${square.getAttribute('x')},${square.getAttribute('y')}`)).toEqual(['8,0', '12,4', '16,8', '12,12', '8,16', '4,12', '0,8', '4,4'])
  })

  it('is what shows beside the stage while Droplet works', () => {
    const { container } = render(<ChatThread messages={[{ id: 1, from: 'droplet', text: '', pending: true }]} />)
    expect(container.querySelector('.diamond')).not.toBeNull()
  })
})

describe('ChatThread', () => {
  const messages: ThreadMessage[] = [
    { id: 1, from: 'you', text: 'How should I price my boxes?' },
    { id: 2, from: 'droplet', text: '', pending: true },
  ]

  it('shows the diamond loader and the word "Thinking" while a reply is pending', () => {
    const { container } = render(<ChatThread messages={messages} />)
    expect(screen.getByText('Thinking')).toBeInTheDocument()
    expect(container.querySelector('.thread__message--pending .diamond')).not.toBeNull()
  })

  it('shows the reply, and no loader, once it arrives', () => {
    const { container } = render(<ChatThread messages={[messages[0], { id: 2, from: 'droplet', text: 'Start from your costs.' }]} />)
    expect(screen.getByText('Start from your costs.')).toBeInTheDocument()
    expect(container.querySelector('.diamond')).toBeNull()
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

  it('does not show suggested replies any more: Droplet asks in words and the founder answers in the box, though a turn may still carry them', () => {
    expect(SHOW_SUGGESTED_REPLIES).toBe(false)
    render(<ChatThread onReply={vi.fn()} messages={[{ id: 1, from: 'droplet', text: 'Hello.', question: 'Ready?', replies: ['Yes, go ahead', 'Not yet'] }]} />)
    expect(screen.getByText('Ready?')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Suggested replies' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Not yet' })).toBeNull()
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

  it('comes in paragraph by paragraph, then its question, each with its place in the order', () => {
    const { container } = render(<ChatThread messages={reply(true)} />)
    const paragraphs = [...container.querySelectorAll('.rich > [data-reveal]')]
    expect(paragraphs.map((node) => (node as HTMLElement).style.getPropertyValue('--i'))).toEqual(['0', '1'])
    expect((container.querySelector('.thread__question') as HTMLElement).style.getPropertyValue('--i')).toBe('4')
    expect(container.querySelector('.thread__replies')).toBeNull()
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

describe('files attached to a message', () => {
  const thread: ThreadMessage[] = [
    { id: 1, from: 'you', text: 'What is in these?', attachments: [{ name: 'notes.md', kind: 'text' }, { name: 'logo.png', kind: 'image' }], at: '2026-10-15T09:00:00.000Z' },
    { id: 2, from: 'droplet', text: 'A list of names, and a logo.', at: '2026-10-15T09:00:05.000Z' },
  ]

  it('shows their names under the message', () => {
    render(<ChatThread messages={thread} />)
    const files = screen.getByRole('list', { name: 'Attached files' })
    expect(files).toHaveTextContent('notes.md')
    expect(files).toHaveTextContent('logo.png')
  })

  it('cannot be tried again or edited, since the files are not kept', () => {
    render(<ChatThread messages={thread} onRetry={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit your message' })).not.toBeInTheDocument()
  })
})

describe('the side panel: one exchange at a time', () => {
  const talk = (count: number): ThreadMessage[] =>
    Array.from({ length: count }, (_, i) => [
      { id: i * 2 + 1, from: 'you' as const, text: `Question ${i + 1}` },
      { id: i * 2 + 2, from: 'droplet' as const, text: `Answer ${i + 1}` },
    ]).flat()

  it('cuts the thread into exchanges: each starts at a message from the founder and holds what follows it', () => {
    const pages = exchangesOf([...talk(2), { id: 9, from: 'droplet', text: 'A note.', local: true }])
    expect(pages.map((page) => page.messages.map((message) => message.id))).toEqual([[1, 2], [3, 4, 9]])
    expect(pages[0].label).toBe('exchange 1: Question 1')
  })

  it('puts a divider with the exchange it introduces, and a first reply with no question before it on a page of its own', () => {
    const pages = exchangesOf([{ id: 1, from: 'droplet', text: 'Welcome.' }, { id: 2, from: 'divider', text: 'Switched workspace to Invoice' }, { id: 3, from: 'you', text: 'Hi' }, { id: 4, from: 'droplet', text: 'Hello' }])
    expect(pages.map((page) => page.messages.map((message) => message.id))).toEqual([[1], [2, 3, 4]])
  })

  it('draws each exchange as a page, and a rail with a tick for each, the one in view marked', () => {
    const { container } = render(<ChatThread messages={talk(3)} paged />)
    expect(container.querySelectorAll('.thread__page')).toHaveLength(3)
    const rail = screen.getByRole('navigation', { name: 'Exchanges in this conversation' })
    const ticks = within(rail).getAllByRole('button')
    expect(ticks).toHaveLength(3)
    // the newest is the one in view when nothing has been scrolled
    expect(ticks.filter((tick) => tick.getAttribute('aria-current') === 'true')).toHaveLength(1)
    expect(ticks[0]).toHaveAccessibleName('Go to exchange 1: Question 1')
    expect(screen.getByRole('log', { name: 'Conversation' })).toHaveTextContent('Answer 3')
  })

  it('has no rail for a single exchange, and is not paged unless it is asked to be', () => {
    const { container, rerender } = render(<ChatThread messages={talk(1)} paged />)
    expect(screen.queryByRole('navigation', { name: 'Exchanges in this conversation' })).toBeNull()
    rerender(<ChatThread messages={talk(3)} />)
    expect(container.querySelector('.thread__page')).toBeNull()
    expect(container.querySelector('.thread-wrap')).toBeNull()
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('scrolls to an exchange when its tick is pressed', async () => {
    const user = userEvent.setup()
    const scrolled: number[] = []
    const scrollTo = { mockRestore: () => delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo }
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: (options: ScrollToOptions) => void scrolled.push(Number(options.top)) })
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', { configurable: true, get() { return Number((this as HTMLElement).dataset.page ?? 0) * 500 } })
    try {
      render(<ChatThread messages={talk(3)} paged />)
      await user.click(screen.getByRole('button', { name: 'Go to exchange 1: Question 1' }))
      expect(scrolled.at(-1)).toBe(0)
      await user.click(screen.getByRole('button', { name: 'Go to exchange 2: Question 2' }))
      expect(scrolled.at(-1)).toBe(500)
    } finally {
      scrollTo.mockRestore()
      Object.defineProperty(HTMLElement.prototype, 'offsetTop', { configurable: true, get: () => 0 })
    }
  })

  it('shows only the ticks near the exchange in view, so a long conversation does not run the rail off the panel', () => {
    render(<ChatThread messages={talk(40)} paged />)
    const ticks = within(screen.getByRole('navigation', { name: 'Exchanges in this conversation' })).getAllByRole('button')
    expect(ticks.length).toBeLessThanOrEqual(10)
    expect(ticks.at(-1)).toHaveAttribute('aria-current', 'true')
  })

  it('makes a tick shorter the further the exchange is from the one in view', () => {
    render(<ChatThread messages={talk(6)} paged />)
    const ticks = within(screen.getByRole('navigation')).getAllByRole('button')
    expect(ticks.map((tick) => tick.getAttribute('data-distance'))).toEqual(['4', '4', '3', '2', '1', '0'])
  })

  it('still does everything a message can do inside a page: copy, try again and the pending line', () => {
    render(<ChatThread messages={[...talk(2), { id: 9, from: 'you', text: 'Latest' }, { id: 10, from: 'droplet', text: '', pending: true }]} paged progress={{ words: 'Thinking it through', elapsed: '' }} onStop={vi.fn()} />)
    expect(screen.getByText('Thinking it through')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Copy reply' }).length).toBeGreaterThan(0)
  })
})
