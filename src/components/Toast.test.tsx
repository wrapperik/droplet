import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Toast from './Toast.tsx'

describe('the toast', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('says what happened, announced to a screen reader, and does the one thing offered when it is pressed, then goes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onAction = vi.fn()
    const onDismiss = vi.fn()
    render(<Toast toast={{ id: 1, text: 'Remembered: who it is for.', actionLabel: 'Undo', onAction }} onDismiss={onDismiss} />)
    expect(screen.getByRole('status')).toHaveTextContent('Remembered: who it is for.')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('goes by itself after a few seconds, and not before', () => {
    const onDismiss = vi.fn()
    render(<Toast toast={{ id: 1, text: 'Done.' }} onDismiss={onDismiss} />)
    act(() => void vi.advanceTimersByTime(7000))
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(1500))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('starts the time again for a new one, and has no button when there is nothing to do', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(<Toast toast={{ id: 1, text: 'First.' }} onDismiss={onDismiss} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(6000))
    rerender(<Toast toast={{ id: 2, text: 'Second.' }} onDismiss={onDismiss} />)
    act(() => void vi.advanceTimersByTime(6000))
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(2500))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('draws nothing when there is none', () => {
    const { container } = render(<Toast toast={null} onDismiss={() => undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
