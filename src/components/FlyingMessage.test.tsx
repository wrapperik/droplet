import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChatThread, { type ThreadMessage } from './ChatThread.tsx'
import FlyingMessage from './FlyingMessage.tsx'
import { FLIGHT_MS } from '../lib/flight.ts'
// The stylesheets are read as text, since the tests render without them. See homeCss.test.ts.
// @ts-expect-error node:fs has no types in the app's config
const { readFileSync } = (await import('node:fs')) as { readFileSync: (path: string, encoding: string) => string }

const from = { left: 300, top: 600, width: 800, height: 64 }
const thread: ThreadMessage[] = [{ id: 1, from: 'you', text: 'I want to make an invoice', at: '2026-10-09T10:00:00.000Z' }]

afterEach(() => vi.restoreAllMocks())

// FlyingMessage is no longer drawn by the thread (a sent message rises into place instead, see ChatThread's `data-rising`). It is kept, and tested
// here on its own, so it can be brought back.
const withTarget = (onEnd: () => void) => (
  <>
    <ul>
      <li className="thread__message" data-message-id="1">
        I want to make an invoice
      </li>
    </ul>
    <FlyingMessage messageId={1} text="I want to make an invoice" from={from} onEnd={onEnd} />
  </>
)

const sized = () =>
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const box = this.classList.contains('thread__message') ? { left: 820, top: 120, width: 240, height: 44 } : { left: 300, top: 600, width: 800, height: 64 }
    return { ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => ({}) } as DOMRect
  })

describe('the copy that used to carry a message out of the bar', () => {
  it('ends at once when there is nothing to fly between (the message has no size)', () => {
    const onEnd = vi.fn()
    render(withTarget(onEnd))
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('is hidden from a screen reader, reaches the message and ends once, at the end', async () => {
    sized()
    const onEnd = vi.fn()
    render(withTarget(onEnd))
    const copy = document.querySelector('.flying') as HTMLElement
    expect(copy).toHaveAttribute('aria-hidden', 'true')
    expect(copy).toHaveTextContent('I want to make an invoice')
    expect(onEnd).not.toHaveBeenCalled()
    await new Promise((resolve) => setTimeout(resolve, FLIGHT_MS + 150))
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(copy.style.left).toBe('820px')
    expect(copy.style.width).toBe('240px')
  })

  it('still flies under React\'s development double run of effects: it is not ended by the first, undone, run', async () => {
    sized()
    const onEnd = vi.fn()
    render(<StrictMode>{withTarget(onEnd)}</StrictMode>)
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(onEnd).not.toHaveBeenCalled()
    expect((document.querySelector('.flying') as HTMLElement).style.left).not.toBe('')
    await new Promise((resolve) => setTimeout(resolve, FLIGHT_MS + 100))
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('is not drawn by the thread any more, which neither hides nor flies a sent message', () => {
    const { container } = render(<ChatThread messages={thread} flight={{ id: 1, from }} />)
    expect(container.querySelector('[data-message-id="1"]')).not.toHaveAttribute('data-flying')
    expect(document.querySelector('.flying')).toBeNull()
  })
})

describe('the founder\'s messages', () => {
  const css = readFileSync('src/components/ChatThread.css', 'utf8')
  const tokens = readFileSync('src/styles/tokens.css', 'utf8')

  it('are in a plain grey bubble: a flat fill, no blur, no hairline and no shadow, and not blue', () => {
    const rule = /\.thread__message--you\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(rule).toMatch(/background:\s*var\(--overlay-10\)/)
    expect(rule).not.toMatch(/box-shadow|border:|border-color|border-width|backdrop/)
    expect(css).not.toMatch(/\.thread__message--you\.glass/)
    expect(css).not.toMatch(/--bubble|--on-bubble/)
    expect(tokens).not.toMatch(/--bubble|--on-bubble/)
  })

  it('do not carry the glass class: there is no blur behind them', () => {
    const { container } = render(<ChatThread messages={thread} />)
    expect(container.querySelector('.thread__message--you')).not.toHaveClass('glass')
  })
})
