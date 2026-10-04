import { useCallback, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { newContent } from '../../lib/invoice.ts'
import { invoiceDocOf, openInvoiceWorkspace, reduceInvoice, type InvoiceAction } from '../../lib/invoiceState.ts'
import InvoiceWorkspace from './InvoiceWorkspace.tsx'

// The whole workspace, wired to the real reducer as Home does. In a test nothing has a size, so the grid stacks its windows.
function Harness() {
  const [state, setState] = useState(() => openInvoiceWorkspace(newContent('2026-10-04')))
  const dispatch = useCallback((action: InvoiceAction) => setState((current) => reduceInvoice(current, action)), [])
  // As in Home, another invoice is another workspace: it opens fresh, with its own id.
  return <InvoiceWorkspace key={invoiceDocOf(state).invoiceId} projectId="duckstack" projectName="DuckStack" state={state} dispatch={dispatch} onReplace={setState} />
}

const toolbar = () => screen.getByRole('toolbar', { name: 'Tools' })
const memory = () => {
  const raw = window.localStorage.getItem('droplet-project-duckstack-memory')
  return raw ? (JSON.parse(raw) as { business: { details: { name: string } } | null; clients: { client: { name: string } }[]; invoices: { revision: number; content: { details: { number: string }; client: { name: string } } }[] }) : null
}
const invoiceSelect = () => screen.getByRole('combobox', { name: 'Invoice' })
const exportButton = () => screen.getByRole('button', { name: /^Export the invoice as a PDF/ })

beforeEach(() => window.localStorage.clear())

describe('the invoice workspace', () => {
  it('opens with the five tools and the readiness tool in the toolbar, and the document and the line items as windows', () => {
    render(<Harness />)
    for (const name of ['Your business', 'Client', 'Terms', 'VAT', 'Total', 'Ready to export?']) {
      expect(within(toolbar()).getByRole('group', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('region', { name: 'Invoice' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Line items' })).toBeInTheDocument()
  })

  it('says what a new invoice needs, and will not export it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(within(toolbar()).getByText('3 things to fix')).toBeInTheDocument()
    expect(exportButton()).toHaveAttribute('aria-disabled', 'true')
    await user.click(exportButton())
    expect(screen.getAllByRole('status').some((status) => status.textContent === '3 things need fixing before you can export.')).toBe(true)
  })

  it('opens the checklist when export is pressed too early, with each missing thing named', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(exportButton())
    const checklist = screen.getByRole('region', { name: 'Ready to export?' })
    expect(within(toolbar()).queryByRole('group', { name: 'Ready to export?' })).not.toBeInTheDocument()
    expect(within(checklist).getByText('Add your business name.')).toBeInTheDocument()
    expect(within(checklist).getByText('Add the name of the client.')).toBeInTheDocument()
    expect(within(checklist).getByText(/Add at least one line/)).toBeInTheDocument()
    expect(within(checklist).getByText('Needed before you can export')).toBeInTheDocument()
    expect(within(checklist).getByText('Worth adding')).toBeInTheDocument()
  })

  it('takes a founder from a missing thing to the part that fixes it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(exportButton())
    const checklist = screen.getByRole('region', { name: 'Ready to export?' })
    await user.click(within(checklist).getByRole('button', { name: /Add the name of the client\. Go and fix it/ }))
    expect(screen.getByRole('region', { name: 'Client' })).toBeInTheDocument()
    expect(within(toolbar()).queryByRole('group', { name: 'Client' })).not.toBeInTheDocument()
  })

  it('is ready, and exports, once the business, the client and a line are filled in', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Your business name'), 'Kindred Gifting')
    await user.type(screen.getByLabelText('Client name'), 'Pretoria Print Works')
    await user.type(screen.getAllByLabelText('Description').filter((element) => element.tagName === 'INPUT')[0], 'Gift box')
    await user.type(screen.getByLabelText('Price each, in rand'), '450')
    expect(within(toolbar()).getByText('Ready to export')).toBeInTheDocument()
    expect(exportButton()).not.toHaveAttribute('aria-disabled')
  })

  it('shows the total in the toolbar as it is worked out', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Price each, in rand'), '450')
    await user.type(screen.getAllByLabelText('Description').filter((element) => element.tagName === 'INPUT')[0], 'Gift box')
    const total = within(within(toolbar()).getByRole('group', { name: 'Total' })).getByRole('status')
    expect(total.textContent?.replace(/[\s ]/g, ' ')).toBe('R 450,00')
  })

  it('turns VAT on, which makes it a tax invoice that needs a VAT number', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Your business name'), 'Kindred')
    await user.click(within(toolbar()).getByRole('switch'))
    expect(screen.getByLabelText(/^Tax invoice/)).toBeInTheDocument()
    await user.click(exportButton())
    const checklist = screen.getByRole('region', { name: 'Ready to export?' })
    expect(within(checklist).getByText('Add your VAT number. A tax invoice must show it.')).toBeInTheDocument()
    expect(within(checklist).getByText('Add your business address. A tax invoice must show it.')).toBeInTheDocument()
  })

  it('does not save when Save is pressed: it says what would be remembered and keeps nothing until it is confirmed', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText('Not saved yet')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Your business name'), 'Kindred Gifting')
    await user.type(screen.getByLabelText('Client name'), 'Pretoria Print Works')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const note = screen.getByRole('dialog', { name: 'Save to DuckStack' })
    expect(within(note).getByRole('checkbox', { name: /Your business details/ })).toBeChecked()
    expect(within(note).getByRole('checkbox', { name: /Pretoria Print Works/ })).toBeChecked()
    expect(within(note).getByRole('checkbox', { name: /Invoice INV-0001/ })).toBeChecked()
    expect(memory()).toBeNull()
    await user.click(within(note).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(memory()).toBeNull()
    expect(screen.getByText('Not saved yet')).toBeInTheDocument()
  })

  it('remembers the business, the client and the invoice once they are confirmed, and says so', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Your business name'), 'Kindred Gifting')
    await user.type(screen.getByLabelText('Client name'), 'Pretoria Print Works')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
    expect(memory()?.business?.details.name).toBe('Kindred Gifting')
    expect(memory()?.clients.map((saved) => saved.client.name)).toEqual(['Pretoria Print Works'])
    expect(memory()?.invoices).toHaveLength(1)
    expect(memory()?.invoices[0]).toMatchObject({ revision: 1, content: { details: { number: 'INV-0001' } } })
    await user.type(screen.getByLabelText('Your business name'), '!')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('remembers only what is ticked', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Your business name'), 'Kindred Gifting')
    await user.type(screen.getByLabelText('Client name'), 'Pretoria Print Works')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('checkbox', { name: /Pretoria Print Works/ }))
    await user.click(screen.getByRole('checkbox', { name: /Invoice INV-0001/ }))
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    expect(memory()?.business?.details.name).toBe('Kindred Gifting')
    expect(memory()?.clients).toEqual([])
    expect(memory()?.invoices).toEqual([])
    expect(screen.getByText('Not saved yet')).toBeInTheDocument()
  })

  it('keeps the number of an invoice that is changed and confirmed again, as a new revision of the same invoice', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Client name'), 'Pretoria')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    await user.type(screen.getByLabelText('Client name'), ' Print Works')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('A new version of it. It keeps its number.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    expect(memory()?.invoices).toHaveLength(1)
    expect(memory()?.invoices[0]).toMatchObject({ revision: 2, content: { details: { number: 'INV-0001' }, client: { name: 'Pretoria Print Works' } } })
  })

  it('starts the next invoice with the business already on it and the next number', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Your business name'), 'Kindred Gifting')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    await user.selectOptions(invoiceSelect(), 'New invoice')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^Invoice INV-0002/)).toBeInTheDocument()
    expect(screen.getByLabelText('Your business name')).toHaveValue('Kindred Gifting')
    expect(screen.getByLabelText('Client name')).toHaveValue('')
  })

  it('fills in a client who is remembered when their name is entered, and never overwrites what was typed', async () => {
    const user = userEvent.setup()
    const client = { name: 'Pretoria Print Works', contact: '', address: '5 Church Square', email: '', vatNumber: '', reference: '' }
    window.localStorage.setItem('droplet-project-duckstack-memory', JSON.stringify({ business: null, clients: [{ id: 'c1', client, confirmedAt: 'x' }], invoices: [] }))
    render(<Harness />)
    await user.type(screen.getByLabelText('Client name'), 'pretoria print works')
    await user.tab()
    expect(screen.getByLabelText(/^Invoice INV-0001/)).toHaveTextContent('5 Church Square')
    expect(screen.getByLabelText('Client name')).toHaveValue('Pretoria Print Works')
  })

  it('asks before leaving an invoice with changes nobody saved, and leaves nothing behind if it stays', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Client name'), 'Pretoria')
    await user.selectOptions(invoiceSelect(), 'New invoice')
    const alert = screen.getByRole('alertdialog', { name: 'Leave INV-0001?' })
    expect(alert).toHaveTextContent('If you leave, they are lost.')
    await user.click(within(alert).getByRole('button', { name: 'Stay' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Client name')).toHaveValue('Pretoria')
    await user.selectOptions(invoiceSelect(), 'New invoice')
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }))
    expect(screen.getByLabelText('Client name')).toHaveValue('')
    expect(memory()).toBeNull()
  })

  it('does not ask to leave an invoice nobody has touched', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.selectOptions(invoiceSelect(), 'New invoice')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('undoes with the button', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Client name'), 'Pretoria')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByLabelText('Client name')).toHaveValue('')
  })
})
