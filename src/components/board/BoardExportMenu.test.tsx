import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import BoardExportMenu from './BoardExportMenu.tsx'

const open = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Export the board' }))

describe('the export menu', () => {
  it('is one button that opens a menu of PDF and PNG, and closes on Escape', async () => {
    const user = userEvent.setup()
    render(<BoardExportMenu onExport={async () => true} blockedReason={() => null} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await open(user)
    expect(screen.getByRole('menuitem', { name: /^PDF\./ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^PNG\./ })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('makes the file chosen, closes the menu, and says it was exported', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn(async () => true)
    render(<BoardExportMenu onExport={onExport} blockedReason={() => null} />)
    await open(user)
    await user.click(screen.getByRole('menuitem', { name: /^PNG\./ }))
    expect(onExport).toHaveBeenCalledExactlyOnceWith('png')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('The board was downloaded.'))
    expect(screen.getByRole('button', { name: 'Export the board' })).toHaveTextContent('Exported')
  })

  it('says so when the file could not be made', async () => {
    const user = userEvent.setup()
    render(<BoardExportMenu onExport={async () => false} blockedReason={() => null} />)
    await open(user)
    await user.click(screen.getByRole('menuitem', { name: /^PDF\./ }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not make the file.'))
    expect(screen.getByRole('button', { name: 'Export the board' })).toHaveTextContent('Not exported')
  })

  it('keeps a choice that is blocked pressable, makes nothing, and says what is missing, in the menu and aloud', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn(async () => true)
    render(<BoardExportMenu onExport={onExport} blockedReason={() => 'Put something on the board first.'} />)
    await open(user)
    const png = screen.getByRole('menuitem', { name: /^PNG\. Put something on the board first\./ })
    expect(png).toHaveAttribute('aria-disabled', 'true')
    await user.click(png)
    expect(onExport).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toHaveTextContent('Put something on the board first.')
    expect(screen.getByRole('status')).toHaveTextContent('Put something on the board first.')
    // both files are the board, so both are blocked
    expect(screen.getByRole('menuitem', { name: /^PDF\. Put something on the board first\./ })).toHaveAttribute('aria-disabled', 'true')
  })
})
