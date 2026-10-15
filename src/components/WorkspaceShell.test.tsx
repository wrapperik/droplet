import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import WorkspaceShell from './WorkspaceShell.tsx'

const base = { canUndo: true, canRedo: true, onUndo: vi.fn(), onRedo: vi.fn() }

function slots() {
  const made = { start: document.createElement('div'), end: document.createElement('div'), shelf: document.createElement('div') }
  document.body.append(made.start, made.end, made.shelf)
  return made
}

describe('the shell of a workspace', () => {
  it('puts undo, redo, save and export in the header slots, and the bar in the shelf, as it always has', () => {
    const header = slots()
    render(<WorkspaceShell {...base} headerSlots={header} bar={<p>The bar</p>} saveStatus="Not saved yet" unsaved onSave={() => {}} exportButton={<button type="button">Export</button>} thing={<p>Thing</p>} panel={<p>Panel</p>} />)
    expect(within(header.start).getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(within(header.end).getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(within(header.end).getByRole('button', { name: 'Export' })).toBeInTheDocument()
    expect(within(header.shelf).getByText('The bar')).toBeInTheDocument()
  })

  it('draws the thing on the left and the panel on the right, unless it is swapped', () => {
    const { container, rerender } = render(<WorkspaceShell {...base} thing={<p>Thing</p>} panel={<p>Panel</p>} thingLabel="The thing" panelLabel="The panel" />)
    const order = () => [...container.querySelectorAll('.wsframe__pane')].map((pane) => pane.getAttribute('aria-label'))
    expect(order()).toEqual(['The thing', 'The panel'])
    expect(container.querySelector('.wsframe')).not.toHaveAttribute('data-swap')
    rerender(<WorkspaceShell {...base} swap thing={<p>Thing</p>} panel={<p>Panel</p>} thingLabel="The thing" panelLabel="The panel" />)
    // swapped: the tools come first in the page as well as on screen, so the cursor reaches them first
    expect(order()).toEqual(['The panel', 'The thing'])
    expect(container.querySelector('.wsframe')).toHaveAttribute('data-swap')
  })

  it('has no task bar at all when it is given none', () => {
    const header = slots()
    render(<WorkspaceShell {...base} headerSlots={header} thing={<p>Thing</p>} panel={<p>Panel</p>} />)
    expect(header.shelf.children).toHaveLength(0)
  })

  it('draws a toolbar of the task\'s own above both panes and puts nothing in the header slots, so nothing is on screen twice', async () => {
    const header = slots()
    const onUndo = vi.fn()
    render(
      <WorkspaceShell
        {...base}
        onUndo={onUndo}
        headerSlots={header}
        saveStatus="Not saved yet"
        exportButton={<button type="button">Export</button>}
        toolbar={(history) => (
          <div role="toolbar" aria-label="Its toolbar">
            <button type="button" onClick={history.undo} disabled={!history.canUndo}>
              Undo from the toolbar
            </button>
          </div>
        )}
        thing={<p>Thing</p>}
        panel={<p>Panel</p>}
      />,
    )
    expect(header.start.children).toHaveLength(0)
    expect(header.end.children).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument()
    const frame = document.querySelector('.wsframe')!
    expect(frame.firstElementChild).toBe(screen.getByRole('toolbar', { name: 'Its toolbar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Undo from the toolbar' }))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(screen.getAllByRole('status').some((status) => status.textContent === 'Undone.')).toBe(true)
  })

  it('still undoes on Ctrl or Cmd with Z when the toolbar is the task\'s own', async () => {
    const onUndo = vi.fn()
    render(<WorkspaceShell {...base} onUndo={onUndo} toolbar={() => <div role="toolbar" aria-label="t" />} thing={<p>Thing</p>} panel={<p>Panel</p>} />)
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(onUndo).toHaveBeenCalledOnce()
  })

  it('hides the panel, and its footer, but keeps them mounted, when only the thing is wanted', () => {
    const { container, rerender } = render(<WorkspaceShell {...base} thing={<p>Thing</p>} panel={<input aria-label="In the panel" />} footer={<p>Footer</p>} />)
    expect(container.querySelector('.wsframe__side')).not.toHaveAttribute('hidden')
    const field = screen.getByLabelText('In the panel')
    rerender(<WorkspaceShell {...base} hidePanel thing={<p>Thing</p>} panel={<input aria-label="In the panel" />} footer={<p>Footer</p>} />)
    expect(container.querySelector('.wsframe__side')).toHaveAttribute('hidden')
    expect(container.querySelector('.wsframe')).toHaveAttribute('data-full')
    expect(container.querySelector('input')).toBe(field)
    expect(screen.queryByRole('textbox', { name: 'In the panel' })).not.toBeInTheDocument()
  })
})
