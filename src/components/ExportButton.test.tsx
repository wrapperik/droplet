import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ExportButton from './ExportButton.tsx'

describe('ExportButton', () => {
  it('exports when pressed, and says it has worked', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn().mockResolvedValue(true)
    render(<ExportButton onExport={onExport} ariaLabel="Export the thing" doneMessage="Done." />)
    await user.click(screen.getByRole('button', { name: 'Export the thing' }))
    expect(onExport).toHaveBeenCalledOnce()
    expect(await screen.findByText('Exported')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Done.')
  })

  it('says so when the file could not be made', async () => {
    const user = userEvent.setup()
    render(<ExportButton onExport={vi.fn().mockResolvedValue(false)} failedMessage="Nope." />)
    await user.click(screen.getByRole('button'))
    expect(await screen.findByText('Not exported')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Nope.')
  })

  it('does not export while it is blocked, but says why, aloud as well, and calls for the list of what is missing', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    const onBlocked = vi.fn()
    render(<ExportButton onExport={onExport} ariaLabel="Export the invoice" blocked={{ reason: '2 things need fixing.', onBlocked }} />)
    const button = screen.getByRole('button', { name: 'Export the invoice. 2 things need fixing.' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    expect(button).toHaveAttribute('title', '2 things need fixing.')
    await user.click(button)
    expect(onExport).not.toHaveBeenCalled()
    expect(onBlocked).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('2 things need fixing.')
  })

  it('exports as soon as it is no longer blocked', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn().mockResolvedValue(true)
    const { rerender } = render(<ExportButton onExport={onExport} blocked={{ reason: 'Not yet.', onBlocked: vi.fn() }} />)
    rerender(<ExportButton onExport={onExport} />)
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-disabled')
    await user.click(screen.getByRole('button'))
    expect(onExport).toHaveBeenCalledOnce()
  })
})
