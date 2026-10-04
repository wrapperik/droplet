import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyBusiness, emptyClient, newContent } from '../../lib/invoice.ts'
import type { SavedClient, SavedInvoice } from '../../lib/memorySave.ts'
import ConfirmSave from './ConfirmSave.tsx'
import { ClientTool } from './InvoiceTools.tsx'
import { BusinessWindow, ClientWindow } from './InvoiceWindows.tsx'
import { InvoicesTool, InvoicesWindow } from './InvoicesPanel.tsx'
import LeaveDialog from './LeaveDialog.tsx'

const client = { ...emptyClient(), name: 'Pretoria Print Works', address: '5 Church Square' }
const remembered: SavedClient[] = [{ id: 'c1', client, confirmedAt: 'x' }]
const invoiceOf = (id: string, number: string, over: Partial<SavedInvoice> = {}): SavedInvoice => ({
  id,
  content: { ...newContent('2026-10-04', number), client },
  revision: 1,
  updatedAt: '2026-10-04T10:00:00',
  ...over,
})

describe('ConfirmSave', () => {
  const items = [
    { id: 'business', label: 'Your business details', detail: 'New.' },
    { id: 'invoice', label: 'Invoice INV-0001', detail: 'Kept.' },
  ]

  it('saves nothing until the confirm button is pressed, and then only what is ticked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ConfirmSave projectName="DuckStack" items={items} unsaved status="Not saved yet" onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onConfirm).not.toHaveBeenCalled()
    await user.click(screen.getByRole('checkbox', { name: /Your business details/ }))
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    expect(onConfirm).toHaveBeenCalledWith(['invoice'])
  })

  it('saves nothing when it is cancelled or Escape is pressed, and has everything ticked again the next time', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ConfirmSave projectName="DuckStack" items={items} unsaved status="" onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('checkbox', { name: /Invoice INV-0001/ }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getAllByRole('checkbox').every((box) => (box as HTMLInputElement).checked)).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('says there is nothing new to remember when only the arrangement changed, and still saves it', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ConfirmSave projectName="DuckStack" items={[]} unsaved status="" onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText(/nothing new to remember/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    expect(onConfirm).toHaveBeenCalledWith([])
  })

  it('has nothing to press when nothing has changed', () => {
    render(<ConfirmSave projectName="DuckStack" items={[]} unsaved={false} status="All changes saved" onConfirm={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled()
  })
})

describe('the client tool', () => {
  it('offers the clients that are remembered, and fills in a remembered client who has nothing else filled in when the field is left', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    const content = { ...newContent('2026-10-04'), client: { ...emptyClient(), name: 'pretoria print works' } }
    const { container } = render(<ClientTool content={content} remembered={remembered} dispatch={dispatch} />)
    expect(container.querySelectorAll('datalist option')).toHaveLength(1)
    await user.click(screen.getByLabelText('Client name'))
    await user.tab()
    expect(dispatch).toHaveBeenCalledWith({ type: 'set_client', patch: client })
  })

  it('does not overwrite a client who has other details typed already, or a name that is not remembered', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    const typed = { ...newContent('2026-10-04'), client: { ...emptyClient(), name: 'Pretoria Print Works', email: 'me@example.com' } }
    const { rerender } = render(<ClientTool content={typed} remembered={remembered} dispatch={dispatch} />)
    await user.click(screen.getByLabelText('Client name'))
    await user.tab()
    expect(dispatch).not.toHaveBeenCalled()
    rerender(<ClientTool content={{ ...newContent('2026-10-04'), client: { ...emptyClient(), name: 'Someone new' } }} remembered={remembered} dispatch={dispatch} />)
    await user.click(screen.getByLabelText('Client name'))
    await user.tab()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('offers no list when nothing is remembered', () => {
    const { container } = render(<ClientTool content={newContent('2026-10-04')} remembered={[]} dispatch={vi.fn()} />)
    expect(container.querySelector('datalist')).toBeNull()
  })
})

describe('what is remembered, in the windows', () => {
  it('the business window says whether the business is remembered, and forgets it only when asked twice', async () => {
    const user = userEvent.setup()
    const onForget = vi.fn()
    const { rerender } = render(<BusinessWindow business={emptyBusiness()} status="none" onForget={onForget} dispatch={vi.fn()} reason="Why." />)
    expect(screen.getByText(/Fill in the name, and you can save your business details for next time/)).toBeInTheDocument()
    rerender(<BusinessWindow business={emptyBusiness()} status="new" onForget={onForget} dispatch={vi.fn()} reason="Why." />)
    expect(screen.getByText(/Not remembered yet/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Forget' })).not.toBeInTheDocument()
    rerender(<BusinessWindow business={emptyBusiness()} status="updated" onForget={onForget} dispatch={vi.fn()} reason="Why." />)
    expect(screen.getByText(/Changed since it was remembered/)).toBeInTheDocument()
    rerender(<BusinessWindow business={emptyBusiness()} status="same" onForget={onForget} dispatch={vi.fn()} reason="Why." />)
    expect(screen.getByText(/Remembered, so it is ready on the next invoice/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Forget' }))
    expect(onForget).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(onForget).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Forget' }))
    await user.click(within(screen.getByText('Forget it?').parentElement!).getByRole('button', { name: 'Forget' }))
    expect(onForget).toHaveBeenCalledOnce()
  })

  it('the client window lists the clients that are saved, uses one, and forgets one only when asked twice', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    const onForget = vi.fn()
    render(<ClientWindow client={emptyClient()} status="none" remembered={remembered} onForget={onForget} dispatch={dispatch} reason="Why." />)
    expect(screen.getByText('Clients you have saved')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use Pretoria Print Works' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'set_client', patch: client })
    await user.click(screen.getByRole('button', { name: 'Forget Pretoria Print Works' }))
    expect(onForget).not.toHaveBeenCalled()
    await user.click(within(screen.getByText('Forget?').parentElement!).getByRole('button', { name: 'Forget' }))
    expect(onForget).toHaveBeenCalledWith('c1')
  })

  it('the client window can forget the client that is on the invoice, when they are remembered', async () => {
    const user = userEvent.setup()
    const onForget = vi.fn()
    render(<ClientWindow client={client} status="same" remembered={remembered} onForget={onForget} dispatch={vi.fn()} reason="Why." />)
    expect(screen.getByText(/Remembered, so it is ready on the next invoice/)).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: 'Forget' })
    await user.click(buttons[buttons.length - 1])
    await user.click(within(screen.getByText('Forget it?').parentElement!).getByRole('button', { name: 'Forget' }))
    expect(onForget).toHaveBeenCalledWith('c1')
  })
})

describe('the invoices tool and window', () => {
  const saved = [invoiceOf('i1', 'INV-0001'), invoiceOf('i2', 'INV-0002', { updatedAt: '2026-10-05T10:00:00', revision: 3 })]
  const current = saved[1].content

  it('the tool lists the saved invoices and a new one, and opens another when chosen', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    const onNew = vi.fn()
    render(<InvoicesTool currentId="i2" current={current} saved={saved} onOpen={onOpen} onNew={onNew} />)
    const select = screen.getByRole('combobox', { name: 'Invoice' })
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['INV-0001 · Pretoria Print Works', 'INV-0002 · Pretoria Print Works', 'New invoice'])
    expect(select).toHaveValue('i2')
    await user.selectOptions(select, 'i1')
    expect(onOpen).toHaveBeenCalledWith('i1')
    await user.selectOptions(select, 'New invoice')
    expect(onNew).toHaveBeenCalledOnce()
  })

  it('the tool shows an invoice that is not saved yet as the open one', () => {
    render(<InvoicesTool currentId="new" current={newContent('2026-10-04', 'INV-0003')} saved={saved} onOpen={vi.fn()} onNew={vi.fn()} />)
    expect(screen.getByRole('option', { name: 'INV-0003 (not saved)' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Invoice' })).toHaveValue('new')
  })

  it('the window lists each invoice with where it stands, newest first, and marks the one that is open', () => {
    const exported = invoiceOf('i3', 'INV-0003', { exportedAt: '2026-10-06T09:00:00', updatedAt: '2026-10-06T09:00:00' })
    const revised = invoiceOf('i4', 'INV-0004', { exportedAt: '2026-10-06T09:00:00', updatedAt: '2026-10-07T09:00:00' })
    render(<InvoicesWindow currentId="i2" current={current} saved={[...saved, exported, revised]} onOpen={vi.fn()} onNew={vi.fn()} onCopy={vi.fn()} onForget={vi.fn()} reason="Why." />)
    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.querySelector('.invoices__name')?.textContent?.slice(0, 8))).toEqual(['INV-0004', 'INV-0003', 'INV-0002', 'INV-0001'])
    expect(items[0]).toHaveTextContent('Changed since it was exported on 6 October 2026')
    expect(items[1]).toHaveTextContent('Exported on 6 October 2026')
    expect(items[2]).toHaveTextContent('Open now')
    expect(items[2]).toHaveTextContent('Saved 3 times.')
    expect(items[3]).toHaveTextContent('Not exported yet. Saved once.')
    expect(within(items[2]).queryByRole('button', { name: /^Open / })).not.toBeInTheDocument()
  })

  it('the window opens, copies and starts invoices, and forgets one only when asked twice', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    const onNew = vi.fn()
    const onCopy = vi.fn()
    const onForget = vi.fn()
    render(<InvoicesWindow currentId="i2" current={current} saved={saved} onOpen={onOpen} onNew={onNew} onCopy={onCopy} onForget={onForget} reason="Why." />)
    await user.click(screen.getByRole('button', { name: 'Open INV-0001 · Pretoria Print Works' }))
    expect(onOpen).toHaveBeenCalledWith('i1')
    await user.click(screen.getByRole('button', { name: 'Start a new invoice from INV-0001 · Pretoria Print Works' }))
    expect(onCopy).toHaveBeenCalledWith('i1')
    await user.click(screen.getByRole('button', { name: 'New invoice' }))
    expect(onNew).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Forget INV-0001 · Pretoria Print Works' }))
    expect(onForget).not.toHaveBeenCalled()
    await user.click(within(screen.getByText('Forget it?').parentElement!).getByRole('button', { name: 'Forget' }))
    expect(onForget).toHaveBeenCalledWith('i1')
  })

  it('the window says nothing is saved yet when nothing is', () => {
    render(<InvoicesWindow currentId="new" current={newContent('2026-10-04')} saved={[]} onOpen={vi.fn()} onNew={vi.fn()} onCopy={vi.fn()} onForget={vi.fn()} reason="Why." />)
    expect(screen.getByText(/Nothing is saved yet/)).toBeInTheDocument()
    expect(screen.getByText(/Open now. Not saved yet./)).toBeInTheDocument()
  })
})

describe('LeaveDialog', () => {
  it('puts the safe choice in focus, stays on Escape, and leaves only when asked', async () => {
    const user = userEvent.setup()
    const onLeave = vi.fn()
    const onStay = vi.fn()
    render(<LeaveDialog what="INV-0007" onLeave={onLeave} onStay={onStay} />)
    expect(screen.getByRole('alertdialog', { name: 'Leave INV-0007?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stay' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(onStay).toHaveBeenCalledOnce()
    expect(onLeave).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }))
    expect(onLeave).toHaveBeenCalledOnce()
  })
})
