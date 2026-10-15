import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BuildingsIcon, CursorIcon, UserIcon } from '@solar-icons/react/linear'
import TaskBar, { type BarItem } from './TaskBar.tsx'
import { useBarTip } from './taskBarContext.ts'

const item = (over: Partial<BarItem> = {}): BarItem => ({ id: 'business', title: 'Your business', label: 'Business', reason: 'Who the invoice comes from.', icon: BuildingsIcon, ...over })

describe('the task bar, for a task with parts', () => {
  it('shows each part as its icon and its name, with the full title and the reason in a tooltip that describes the button', () => {
    render(<TaskBar kind="parts" label="Parts of the invoice" items={[item(), item({ id: 'client', title: 'Client', label: 'Client', reason: 'Who it is for.', icon: UserIcon })]} />)
    const button = screen.getByRole('button', { name: 'Business' })
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(within(button).getByText('Business')).toBeVisible()
    const tip = screen.getAllByRole('tooltip')[0]
    expect(tip).toHaveTextContent('Your business')
    expect(tip).toHaveTextContent('Who the invoice comes from.')
    expect(button).toHaveAccessibleDescription(/Your business.*Who the invoice comes from\./)
  })

  it('says in words whether a part is complete, and shows the mark as a ring or a tick', () => {
    render(<TaskBar kind="parts" label="Parts" items={[item({ done: false }), item({ id: 'client', label: 'Client', title: 'Client', done: true })]} />)
    expect(screen.getByRole('button', { name: 'Business, not complete yet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Client, complete' })).toBeInTheDocument()
    const marks = document.querySelectorAll('.taskbar__mark')
    expect(marks[0]).not.toHaveAttribute('data-done')
    expect(marks[1]).toHaveAttribute('data-done')
    expect(marks[1].querySelector('svg')).not.toBeNull()
  })

  it('has no mark for a part with nothing to complete', () => {
    render(<TaskBar kind="parts" label="Parts" items={[item()]} />)
    expect(document.querySelector('.taskbar__mark')).toBeNull()
  })

  it('goes to a part when it is pressed, marks the current one, and does nothing for a part that is locked', async () => {
    const user = userEvent.setup()
    const go = vi.fn()
    const locked = vi.fn()
    render(<TaskBar kind="parts" label="Parts" items={[item({ current: 'step', onSelect: go }), item({ id: 'client', label: 'Client', title: 'Client', locked: true, onSelect: locked })]} />)
    await user.click(screen.getByRole('button', { name: 'Business' }))
    expect(go).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Business' })).toHaveAttribute('aria-current', 'step')
    const later = screen.getByRole('button', { name: /^Client/ })
    expect(later).toHaveAttribute('aria-disabled', 'true')
    expect(later).toHaveTextContent('not reached yet')
    await user.click(later)
    expect(locked).not.toHaveBeenCalled()
    // it can still be reached with the keyboard, so its tooltip can be read
    later.focus()
    expect(later).toHaveFocus()
  })

  it('is a group of buttons, and nothing in it is draggable', () => {
    const { container } = render(<TaskBar kind="parts" label="Parts of the invoice" items={[item()]} />)
    expect(screen.getByRole('group', { name: 'Parts of the invoice' })).toBeInTheDocument()
    expect(container.querySelector('[draggable]')).toBeNull()
  })
})

describe('the task bar, for a task with tools', () => {
  function Tool() {
    const tip = useBarTip()
    return (
      <button type="button" className="taskbar__trigger" aria-describedby={tip}>
        <CursorIcon size={18} aria-hidden="true" />
        Select
      </button>
    )
  }

  it('is a toolbar, draws each tool\'s own control, and gives it the tooltip as its description', () => {
    render(<TaskBar kind="tools" label="Board tools" items={[item({ id: 'select', title: 'Select', label: 'Select', reason: 'Move things.', icon: CursorIcon, control: <Tool /> })]} />)
    expect(screen.getByRole('toolbar', { name: 'Board tools' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAccessibleDescription(/Select.*Move things\./)
  })
})
