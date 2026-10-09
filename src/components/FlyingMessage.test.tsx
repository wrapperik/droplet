import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChatThread, { type ThreadMessage } from './ChatThread.tsx'
import { FLIGHT_MS } from '../lib/flight.ts'
// The stylesheets are read as text, since the tests render without them. See homeCss.test.ts.
// @ts-expect-error node:fs has no types in the app's config
const { readFileSync } = (await import('node:fs')) as { readFileSync: (path: string, encoding: string) => string }

const from = { left: 300, top: 600, width: 800, height: 64 }
const thread: ThreadMessage[] = [{ id: 1, from: 'you', text: 'I want to make an invoice', at: '2026-10-09T10:00:00.000Z' }]

afterEach(() => vi.restoreAllMocks())

describe('a message coming out of the bar', () => {
  it('is shown at once when there is nothing to fly between (the message has no size)', () => {
    const onFlightEnd = vi.fn()
    const { container } = render(<ChatThread messages={thread} flight={{ id: 1, from }} onFlightEnd={onFlightEnd} />)
    expect(onFlightEnd).toHaveBeenCalledTimes(1)
    expect(container.ownerDocument.querySelector('.flying')).not.toBeNull() // drawn until the parent clears the flight
  })

  it('hides the real message while its copy is on the way, keeps it for a screen reader, and ends once, at the end', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const box = this.classList.contains('thread__message') ? { left: 820, top: 120, width: 240, height: 44 } : { left: 300, top: 600, width: 800, height: 64 }
      return { ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => ({}) } as DOMRect
    })
    const onFlightEnd = vi.fn()
    const { container } = render(<ChatThread messages={thread} flight={{ id: 1, from }} onFlightEnd={onFlightEnd} />)
    const real = container.querySelector('[data-message-id="1"]')!
    expect(real).toHaveAttribute('data-flying')
    // the real message is still in the page's reading order: it is hidden by visibility in CSS, not removed
    expect(real).toHaveTextContent('You: I want to make an invoice')
    const copy = document.querySelector('.flying')!
    expect(copy).toHaveAttribute('aria-hidden', 'true')
    expect(copy).toHaveTextContent('I want to make an invoice')
    expect(onFlightEnd).not.toHaveBeenCalled()
    await new Promise((resolve) => setTimeout(resolve, FLIGHT_MS + 150))
    expect(onFlightEnd).toHaveBeenCalledTimes(1)
    // the copy has reached the message
    expect((copy as HTMLElement).style.left).toBe('820px')
    expect((copy as HTMLElement).style.width).toBe('240px')
  })

  it('still flies under React\'s development double run of effects: it is not ended by the first, undone, run', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const box = this.classList.contains('thread__message') ? { left: 820, top: 120, width: 240, height: 44 } : { left: 300, top: 600, width: 800, height: 64 }
      return { ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => ({}) } as DOMRect
    })
    const onFlightEnd = vi.fn()
    render(
      <StrictMode>
        <ChatThread messages={thread} flight={{ id: 1, from }} onFlightEnd={onFlightEnd} />
      </StrictMode>,
    )
    await new Promise((resolve) => setTimeout(resolve, 150))
    // part of the way: still flying, not ended, and moving
    expect(onFlightEnd).not.toHaveBeenCalled()
    const copy = document.querySelector('.flying') as HTMLElement
    expect(copy.style.left).not.toBe('')
    await new Promise((resolve) => setTimeout(resolve, FLIGHT_MS + 100))
    expect(onFlightEnd).toHaveBeenCalledTimes(1)
  })

  it('does not hide or fly a message when there is no flight', () => {
    const { container } = render(<ChatThread messages={thread} />)
    expect(container.querySelector('[data-message-id="1"]')).not.toHaveAttribute('data-flying')
    expect(document.querySelector('.flying')).toBeNull()
  })
})

describe('the founder\'s messages', () => {
  const css = readFileSync('src/components/ChatThread.css', 'utf8')
  const tokens = readFileSync('src/styles/tokens.css', 'utf8')

  it('are in the message bar\'s own style: its fill, its hairline and its shadow, not blue', () => {
    expect(css).toMatch(/\.thread__message--you\.glass\s*\{[^}]*background:\s*var\(--intent-fill\)/)
    expect(css).toMatch(/\.thread__message--you\.glass\s*\{[^}]*border-color:\s*var\(--intent-edge\)/)
    expect(css).toMatch(/\.thread__message--you\.glass\s*\{[^}]*box-shadow:\s*var\(--intent-shadow\)/)
    expect(css).not.toMatch(/--bubble|--on-bubble/)
    expect(tokens).not.toMatch(/--bubble|--on-bubble/)
  })

  it('carry the glass class, as the bar does', () => {
    const { container } = render(<ChatThread messages={thread} />)
    expect(container.querySelector('.thread__message--you')).toHaveClass('glass')
  })
})
