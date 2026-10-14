import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { NOT_SENT, type Used } from '../compose/used.ts'
import UsedLine from './UsedLine.tsx'

const used: Used = {
  items: [
    { label: 'Your saved palette', detail: '5 colours with their hex codes and roles.' },
    { label: 'Business name', detail: 'The name you decided on, or the name on your invoices.' },
  ],
}

describe('the line under a reply saying what Droplet used', () => {
  it('is two quiet words to begin with, with the full line as its name, and a button that is closed', () => {
    render(<UsedLine used={used} />)
    const line = screen.getByRole('button', { name: 'Used: your saved palette, business name' })
    expect(line).toHaveTextContent('What I used')
    expect(line).not.toHaveTextContent(/saved palette/)
    expect(line).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(NOT_SENT)).not.toBeInTheDocument()
  })

  it('opens into the list of what was sent and what was not, and closes again', async () => {
    render(<UsedLine used={used} />)
    const line = screen.getByRole('button', { name: /^Used:/ })
    await userEvent.click(line)
    expect(line).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('5 colours with their hex codes and roles.')).toBeInTheDocument()
    expect(screen.getByText(NOT_SENT)).toBeInTheDocument()
    await userEvent.click(line)
    expect(screen.queryByText(NOT_SENT)).not.toBeInTheDocument()
  })

  it('shows the not-sent line even when only the message went', async () => {
    render(<UsedLine used={{ items: [] }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Used: only your message' }))
    expect(screen.getByText(NOT_SENT)).toBeInTheDocument()
  })
})
