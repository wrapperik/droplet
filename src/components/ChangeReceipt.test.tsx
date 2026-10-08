import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Receipt } from '../compose/receipt.ts'
import ChangeReceipt from './ChangeReceipt.tsx'

const receipt: Receipt = {
  heading: 'Changed on the board',
  lines: [
    { mark: '+', text: '5 notes in “Name ideas”' },
    { mark: '', text: '3 notes moved to a new frame' },
    { mark: '-', text: 'Colour 2 removed' },
  ],
  left: ['Adding a note: There is no clear place beside n3.'],
}

describe('the change receipt', () => {
  it('has a heading, a line for each change, and the things left out under their own heading, with the reason', () => {
    render(<ChangeReceipt receipt={receipt} />)
    const card = screen.getByRole('region', { name: 'Changed on the board' })
    expect(within(card).getByRole('heading', { name: 'Changed on the board' })).toBeInTheDocument()
    expect(within(card).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '+Added: 5 notes in “Name ideas”',
      '3 notes moved to a new frame',
      '−Removed: Colour 2 removed',
      'Adding a note: There is no clear place beside n3.',
    ])
    expect(within(card).getByText('Left out')).toBeInTheDocument()
  })

  it('never says what was added or removed by its sign or its colour alone: a word is there for a screen reader', () => {
    render(<ChangeReceipt receipt={receipt} />)
    expect(screen.getByText('Added:')).toHaveClass('visually-hidden')
    expect(screen.getByText('Removed:')).toHaveClass('visually-hidden')
    for (const sign of document.querySelectorAll('.receipt__mark')) expect(sign).toHaveAttribute('aria-hidden', 'true')
  })

  it('has no heading for what was left out when nothing was', () => {
    render(<ChangeReceipt receipt={{ ...receipt, left: [] }} />)
    expect(screen.queryByText('Left out')).not.toBeInTheDocument()
  })

  it('offers Undo this and Show me when the reply is one of this session, and calls them', async () => {
    const user = userEvent.setup()
    const onUndo = vi.fn()
    const onShow = vi.fn()
    render(<ChangeReceipt receipt={receipt} canUndo canShow onUndo={onUndo} onShow={onShow} />)
    await user.click(screen.getByRole('button', { name: 'Undo this' }))
    await user.click(screen.getByRole('button', { name: 'Show me' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onShow).toHaveBeenCalledTimes(1)
  })

  it('has no buttons when the receipt has been kept from an earlier session: the lines are all that is left', () => {
    render(<ChangeReceipt receipt={receipt} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('waits while Droplet is working', () => {
    render(<ChangeReceipt receipt={receipt} canUndo canShow busy />)
    expect(screen.getByRole('button', { name: 'Undo this' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Show me' })).toBeDisabled()
  })

  it('says how Undo this ended, and takes the button away so it is pressed once', () => {
    render(<ChangeReceipt receipt={{ ...receipt, status: 'Undone. It is as it was before this reply.' }} canUndo canShow />)
    expect(screen.getByRole('status')).toHaveTextContent('Undone. It is as it was before this reply.')
    expect(screen.queryByRole('button', { name: 'Undo this' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show me' })).toBeInTheDocument()
  })
})
