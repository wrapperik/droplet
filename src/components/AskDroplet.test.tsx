import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { colourSuggestions } from '../lib/inlineAi.ts'
import { AskContext } from './AskContext.tsx'
import AskDroplet from './AskDroplet.tsx'

const setup = (busy = false, suggestions = colourSuggestions(2)) => {
  const ask = vi.fn()
  render(
    <AskContext.Provider value={{ ask, busy }}>
      <AskDroplet suggestions={suggestions} label="Ask Droplet about colour 2" compact />
    </AskContext.Provider>,
  )
  return ask
}

describe('Ask Droplet, where the work is', () => {
  it('draws nothing where there is no chat to send to', () => {
    render(<AskDroplet suggestions={colourSuggestions(2)} label="Ask Droplet about colour 2" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('draws nothing when there is nothing to offer', () => {
    setup(false, [])
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens a list of suggestions and a field, and closes on Escape with focus back on the button', async () => {
    setup()
    const button = screen.getByRole('button', { name: 'Ask Droplet about colour 2' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByRole('dialog', { name: 'Ask Droplet about colour 2' })
    expect(panel).toHaveTextContent('Warmer')
    expect(panel).toHaveTextContent('Find a pair that passes')
    expect(screen.getByRole('textbox', { name: 'Ask about this' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('sends the suggestion as the founder\'s own words, and closes', async () => {
    const ask = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Ask Droplet about colour 2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Warmer' }))
    expect(ask).toHaveBeenCalledWith('Make colour 2 warmer')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sends what is typed, and nothing when it is empty', async () => {
    const ask = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Ask Droplet about colour 2' }))
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox', { name: 'Ask about this' }), 'Is this too bright?{Enter}')
    expect(ask).toHaveBeenCalledWith('Is this too bright?')
  })

  it('waits while Droplet is working, and says so', async () => {
    const ask = setup(true)
    await userEvent.click(screen.getByRole('button', { name: 'Ask Droplet about colour 2' }))
    expect(screen.getByRole('button', { name: 'Warmer' })).toBeDisabled()
    expect(screen.getByText('Droplet is working on a reply.')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Ask about this' }), 'hello{Enter}')
    expect(ask).not.toHaveBeenCalled()
  })

  it('closes on a press outside', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Ask Droplet about colour 2' }))
    await userEvent.click(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
