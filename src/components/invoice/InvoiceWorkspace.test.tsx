import { useCallback, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setDocumentStorage, type DocumentStorage } from '../../lib/storage.ts'
import { slowMemoryStorage } from '../../test/slowStorage.ts'
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
// The toolbar holds each tool as a button: its icon and name, with a tick once its part is complete. Pressing it opens its window.
const step = (title: string) => within(toolbar()).getByRole('button', { name: new RegExp(`^${title.replace('?', '\\?')}\\.`) })
const isOpen = (title: string) => step(title).getAttribute('aria-expanded') === 'true'
const isDone = (title: string) => /Complete\./.test(step(title).getAttribute('aria-label') ?? '')
const openStep = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
  if (!isOpen(title)) await user.click(step(title))
}
const businessName = async (user: ReturnType<typeof userEvent.setup>) => {
  await openStep(user, 'Your business')
  return screen.getByLabelText('Business name')
}
const clientName = async (user: ReturnType<typeof userEvent.setup>) => {
  await openStep(user, 'Client')
  return screen.getByLabelText('Client or company name')
}
const newInvoice = async (user: ReturnType<typeof userEvent.setup>) => {
  await openStep(user, 'Invoices')
  await user.click(screen.getByRole('button', { name: 'New invoice' }))
}
const exportButton = () => screen.getByRole('button', { name: /^Export the invoice as a PDF/ })

beforeEach(() => window.localStorage.clear())

describe('the invoice workspace', () => {
  it('opens with each tool in the toolbar as an icon and a name, none of them open, and the document and the line items as windows', () => {
    render(<Harness />)
    for (const name of ['Invoices', 'Your business', 'Client', 'Terms', 'VAT', 'Total', 'Ready to export?']) {
      expect(step(name)).toHaveAttribute('aria-expanded', 'false')
    }
    // Nothing to type into in the bar: the tools are not controls any more.
    expect(within(toolbar()).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(toolbar()).queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Invoice' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Line items' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Your business' })).not.toBeInTheDocument()
  })

  it('ticks only the steps whose part is complete: a new invoice has its terms and VAT settled, and needs the rest', () => {
    render(<Harness />)
    expect(['Terms', 'VAT'].map(isDone)).toEqual([true, true])
    expect(['Your business', 'Client', 'Total', 'Ready to export?'].map(isDone)).toEqual([false, false, false, false])
    // The list of invoices has nothing to complete, so it has no tick.
    expect(isDone('Invoices')).toBe(false)
    expect(step('Invoices').querySelector('.shelf__mark')).toBeNull()
  })

  it('opens a window from its step, takes the tick once the part is filled in, and closes it again without losing what was typed', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(isDone('Your business')).toBe(false)
    await user.type(await businessName(user), 'Kindred Gifting')
    expect(isOpen('Your business')).toBe(true)
    expect(screen.getByRole('region', { name: 'Your business' })).toBeInTheDocument()
    expect(isDone('Your business')).toBe(true)
    await user.click(step('Your business'))
    expect(isOpen('Your business')).toBe(false)
    expect(screen.queryByRole('region', { name: 'Your business' })).not.toBeInTheDocument()
    // Still ticked once closed, and still on the document.
    expect(isDone('Your business')).toBe(true)
    expect(screen.getByLabelText(/^Invoice INV-0001/)).toHaveTextContent('Kindred Gifting')
  })

  it('says what a new invoice needs, and will not export it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(isDone('Ready to export?')).toBe(false)
    expect(exportButton()).toHaveAttribute('aria-disabled', 'true')
    await user.click(exportButton())
    expect(screen.getAllByRole('status').some((status) => status.textContent === '3 things need fixing before you can export.')).toBe(true)
  })

  it('opens the checklist when export is pressed too early, with each missing thing named', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(exportButton())
    const checklist = screen.getByRole('region', { name: 'Ready to export?' })
    expect(isOpen('Ready to export?')).toBe(true)
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
    expect(isOpen('Client')).toBe(true)
  })

  it('is ready, and exports, once the business, the client and a line are filled in', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(await businessName(user), 'Kindred Gifting')
    await user.type(await clientName(user), 'Pretoria Print Works')
    await user.type(screen.getAllByLabelText('Description').filter((element) => element.tagName === 'INPUT')[0], 'Gift box')
    await user.type(screen.getByLabelText('Price each, in rand'), '450')
    expect(['Your business', 'Client', 'Terms', 'VAT', 'Total', 'Ready to export?'].map(isDone)).toEqual([true, true, true, true, true, true])
    expect(exportButton()).not.toHaveAttribute('aria-disabled')
  })

  it('shows the total, worked out, in its window, and ticks it once the lines are whole', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Price each, in rand'), '450')
    // A price with no description is not a whole line yet.
    expect(isDone('Total')).toBe(false)
    await user.type(screen.getAllByLabelText('Description').filter((element) => element.tagName === 'INPUT')[0], 'Gift box')
    expect(isDone('Total')).toBe(true)
    await openStep(user, 'Total')
    const totals = screen.getByRole('region', { name: 'Totals' })
    expect(totals.textContent?.replace(/[\s\u00a0]/g, ' ')).toContain('R 450,00')
  })

  it('turns VAT on, which makes it a tax invoice that needs a VAT number', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(await businessName(user), 'Kindred')
    await openStep(user, 'VAT')
    await user.click(screen.getByRole('switch', { name: 'I am registered for VAT' }))
    expect(isDone('VAT')).toBe(false)
    expect(screen.getByLabelText(/^Tax invoice/)).toBeInTheDocument()
    await user.click(exportButton())
    const checklist = screen.getByRole('region', { name: 'Ready to export?' })
    expect(within(checklist).getByText('Add your VAT number. A tax invoice must show it.')).toBeInTheDocument()
    expect(within(checklist).getByText('Add your business address. A tax invoice must show it.')).toBeInTheDocument()
  })

  it('does not save when Save is pressed: it says what would be remembered and keeps nothing until it is confirmed', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    // what was saved is read first, so the bar says nothing for a moment
    expect(await screen.findByText('Not saved yet')).toBeInTheDocument()
    await user.type(await businessName(user), 'Kindred Gifting')
    await user.type(await clientName(user), 'Pretoria Print Works')
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
    await user.type(await businessName(user), 'Kindred Gifting')
    await user.type(await clientName(user), 'Pretoria Print Works')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
    expect(memory()?.business?.details.name).toBe('Kindred Gifting')
    expect(memory()?.clients.map((saved) => saved.client.name)).toEqual(['Pretoria Print Works'])
    expect(memory()?.invoices).toHaveLength(1)
    expect(memory()?.invoices[0]).toMatchObject({ revision: 1, content: { details: { number: 'INV-0001' } } })
    await user.type(await businessName(user), '!')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('remembers only what is ticked', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(await businessName(user), 'Kindred Gifting')
    await user.type(await clientName(user), 'Pretoria Print Works')
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
    await user.type(await clientName(user), 'Pretoria')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    await user.type(await clientName(user), ' Print Works')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('A new version of it. It keeps its number.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    expect(memory()?.invoices).toHaveLength(1)
    expect(memory()?.invoices[0]).toMatchObject({ revision: 2, content: { details: { number: 'INV-0001' }, client: { name: 'Pretoria Print Works' } } })
  })

  it('starts the next invoice with the business already on it and the next number', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(await businessName(user), 'Kindred Gifting')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    await newInvoice(user)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^Invoice INV-0002/)).toBeInTheDocument()
    expect(await businessName(user)).toHaveValue('Kindred Gifting')
    expect(await clientName(user)).toHaveValue('')
  })

  it('fills in a client who is remembered from the saved clients in the client window', async () => {
    const user = userEvent.setup()
    const client = { name: 'Pretoria Print Works', contact: '', address: '5 Church Square', email: '', vatNumber: '', reference: '' }
    window.localStorage.setItem('droplet-project-duckstack-memory', JSON.stringify({ business: null, clients: [{ id: 'c1', client, confirmedAt: 'x' }], invoices: [] }))
    render(<Harness />)
    await openStep(user, 'Client')
    await user.click(screen.getByRole('button', { name: 'Use Pretoria Print Works' }))
    expect(screen.getByLabelText(/^Invoice INV-0001/)).toHaveTextContent('5 Church Square')
    expect(await clientName(user)).toHaveValue('Pretoria Print Works')
    expect(isDone('Client')).toBe(true)
  })

  it('asks before leaving an invoice with changes nobody saved, and leaves nothing behind if it stays', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(await clientName(user), 'Pretoria')
    await newInvoice(user)
    const alert = screen.getByRole('alertdialog', { name: 'Leave INV-0001?' })
    expect(alert).toHaveTextContent('If you leave, they are lost.')
    await user.click(within(alert).getByRole('button', { name: 'Stay' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await clientName(user)).toHaveValue('Pretoria')
    await newInvoice(user)
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }))
    expect(await clientName(user)).toHaveValue('')
    expect(memory()).toBeNull()
  })

  it('does not ask to leave an invoice nobody has touched', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await newInvoice(user)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('undoes with the button', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(await clientName(user), 'Pretoria')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await clientName(user)).toHaveValue('')
  })
})

describe('the invoice workspace while the project\'s memory is still being read', () => {
  let before: DocumentStorage
  afterEach(() => setDocumentStorage(before))

  it('says nothing about saving until the memory has been read, so nothing is judged against what has not arrived', async () => {
    before = setDocumentStorage(slowMemoryStorage(30).driver)
    render(<Harness />)
    expect(screen.queryByText(/Not saved yet|Unsaved changes|All changes saved/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled()
    expect(await screen.findByText('Not saved yet')).toBeInTheDocument()
  })

  it('remembers a confirmed invoice through the storage, and not in this browser\'s', async () => {
    const slow = slowMemoryStorage(5)
    before = setDocumentStorage(slow.driver)
    const user = userEvent.setup()
    render(<Harness />)
    await screen.findByText('Not saved yet')
    await user.type(await businessName(user), 'Kindred Gifting')
    await user.type(await clientName(user), 'Pretoria Print Works')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    // the memory is saved first and the arrangement after it, each taking its time
    await waitFor(() => expect([...slow.documents.keys()].sort()).toEqual(['duckstack/invoice', 'duckstack/memory']))
    expect(window.localStorage.length).toBe(0)
  })
})
