import { useCallback, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setDocumentStorage, type DocumentStorage } from '../../lib/storage.ts'
import { slowMemoryStorage } from '../../test/slowStorage.ts'
import { newContent } from '../../lib/invoice.ts'
import { GUIDE_SHORT, GUIDE_STEPS, GUIDE_TITLES, startGuide, type GuideProgress } from '../../lib/invoiceGuide.ts'
import { invoiceDocOf, openInvoiceWorkspace, reduceInvoice, type InvoiceAction } from '../../lib/invoiceState.ts'
import InvoiceWorkspace from './InvoiceWorkspace.tsx'

// The whole workspace, wired to the real reducer as Home does, in either mode. In a test nothing has a size, so the frame is not measured.
function Harness({ mode = 'workspace' }: { mode?: 'guide' | 'workspace' }) {
  const [state, setState] = useState(() => openInvoiceWorkspace(newContent('2026-10-04')))
  const [progress, setProgress] = useState<GuideProgress | null>(null)
  const dispatch = useCallback((action: InvoiceAction) => setState((current) => reduceInvoice(current, action)), [])
  const id = invoiceDocOf(state).invoiceId
  // As in Home, another invoice is another workspace: it opens fresh, with its own id.
  return (
    <InvoiceWorkspace
      key={id}
      mode={mode}
      projectId="duckstack"
      projectName="DuckStack"
      state={state}
      dispatch={dispatch}
      onReplace={setState}
      progress={progress && progress.invoiceId === id ? progress : startGuide(id)}
      onProgress={setProgress}
      onFinished={() => {}}
    />
  )
}

const bar = () => screen.getByRole('group', { name: 'Parts of the invoice' })
const memory = () => {
  const raw = window.localStorage.getItem('droplet-project-duckstack-memory')
  return raw ? (JSON.parse(raw) as { business: { details: { name: string } } | null; clients: { client: { name: string } }[]; invoices: { revision: number; content: { details: { number: string }; client: { name: string } } }[] }) : null
}
// A part on the task bar is a button: its icon, its name, and a tick once it is complete.
const part = (name: string) => within(bar()).getByRole('button', { name: new RegExp(`^${name}`) })
const isDone = (name: string) => /, complete$/.test(part(name).textContent ?? '')
const businessName = () => screen.getByLabelText('Business name')
const clientName = () => screen.getByLabelText('Client or company name')
const newInvoice = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Invoices' }))
  await user.click(screen.getByRole('button', { name: 'New invoice' }))
}
const exportButton = () => screen.getByRole('button', { name: /^Export the invoice as a PDF/ })

beforeEach(() => window.localStorage.clear())

describe('the frame, in both modes', () => {
  it.each(['workspace', 'guide'] as const)('has the same six parts on the task bar in %s mode, in the same order, each with its name written out', (mode) => {
    render(<Harness mode={mode} />)
    const buttons = within(bar()).getAllByRole('button')
    expect(buttons).toHaveLength(6)
    expect(GUIDE_STEPS.map((id) => GUIDE_SHORT[id])).toEqual(['Business', 'VAT', 'Client', 'Items', 'Details', 'Review'])
    GUIDE_STEPS.forEach((id, place) => {
      // the name is on the bar itself, not only in a tooltip
      expect(within(buttons[place]).getByText(GUIDE_SHORT[id])).toBeVisible()
      // and the tooltip carries the full title
      expect(bar().querySelectorAll('[role="tooltip"]')[place]).toHaveTextContent(GUIDE_TITLES[id])
    })
  })

  it.each(['workspace', 'guide'] as const)('has the page on the left and the panel on the right in %s mode, and an Invoices menu, Undo, Redo, Save and Export in the header', (mode) => {
    render(<Harness mode={mode} />)
    expect(screen.getByRole('region', { name: 'The invoice' })).toContainElement(screen.getByLabelText(/^Invoice INV-0001/))
    expect(screen.getByRole('region', { name: /Step 1 of 6|The parts of the invoice/ })).toBeInTheDocument()
    for (const name of ['Invoices', 'Undo', 'Redo']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save/ })).toBeInTheDocument()
    expect(exportButton()).toBeInTheDocument()
  })

  it.each(['workspace', 'guide'] as const)('has nothing to drag, resize, hide or reset in %s mode', (mode) => {
    const { container } = render(<Harness mode={mode} />)
    for (const name of [/Windows/, /Reset layout/, /Add or remove/, /Add a tool/, /drag/i, /resize/i]) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(container.querySelector('[class*="grip"], [draggable="true"], .gw__item, [data-grip]')).toBeNull()
    // the bar is a group of buttons that go to a part, and none of them is a drag handle
    for (const button of within(bar()).getAllByRole('button')) expect(button).not.toHaveAccessibleName(/drag/i)
  })

  it('keeps the page mounted when the mode changes, so only the panel and the footer change', async () => {
    const user = userEvent.setup()
    function Switching() {
      const [mode, setMode] = useState<'guide' | 'workspace'>('workspace')
      return (
        <>
          <button type="button" onClick={() => setMode('guide')}>
            Switch to Guide
          </button>
          <Harness mode={mode} />
        </>
      )
    }
    const { container } = render(<Switching />)
    const page = container.querySelector('.paper')
    expect(page).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Switch to Guide' }))
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    expect(container.querySelector('.paper')).toBe(page)
  })
})

describe('Workspace mode', () => {
  it('shows every part in the panel at once, each with its heading and its lead', () => {
    render(<Harness />)
    for (const id of GUIDE_STEPS) {
      const section = screen.getByRole('region', { name: GUIDE_TITLES[id] })
      expect(section).toHaveAttribute('data-part', id)
    }
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('ticks only the parts that are complete: a new invoice has its details and VAT settled, and needs the rest', () => {
    render(<Harness />)
    expect(['VAT', 'Details'].map(isDone)).toEqual([true, true])
    expect(['Business', 'Client', 'Items', 'Review'].map(isDone)).toEqual([false, false, false, false])
    // a part that is not complete says so in words, not only by its ring
    expect(part('Business')).toHaveTextContent('not complete yet')
  })

  it('puts the totals directly under the line items, in the same part', () => {
    render(<Harness />)
    const items = screen.getByRole('region', { name: GUIDE_TITLES.lines })
    expect(within(items).getByRole('button', { name: 'Add a line' })).toBeInTheDocument()
    expect(within(items).getByText('Total due')).toBeInTheDocument()
    expect(items.querySelector('.lines')!.compareDocumentPosition(items.querySelector('.totals')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('goes to a part when it is pressed on the bar, and puts the cursor in its first field', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(part('Client'))
    expect(clientName()).toHaveFocus()
    expect(part('Client')).toHaveAttribute('aria-current', 'location')
    await user.click(part('Business'))
    expect(businessName()).toHaveFocus()
    expect(part('Business')).toHaveAttribute('aria-current', 'location')
    expect(part('Client')).not.toHaveAttribute('aria-current')
  })

  it('marks the part the cursor is in as the one in view', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(clientName())
    expect(part('Client')).toHaveAttribute('aria-current', 'location')
  })

  it('ticks a part once it is filled in, and the document follows what is typed', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(isDone('Business')).toBe(false)
    await user.type(businessName(), 'Kindred Gifting')
    expect(isDone('Business')).toBe(true)
    expect(screen.getByLabelText(/^Invoice INV-0001/)).toHaveTextContent('Kindred Gifting')
  })

  it('says what a new invoice needs, and will not export it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(isDone('Review')).toBe(false)
    expect(exportButton()).toHaveAttribute('aria-disabled', 'true')
    await user.click(exportButton())
    expect(screen.getAllByRole('status').some((status) => status.textContent === '3 things need fixing before you can export.')).toBe(true)
  })

  it('goes to Review when export is pressed too early, with each missing thing named', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(exportButton())
    const review = screen.getByRole('region', { name: GUIDE_TITLES.review })
    expect(review).toHaveFocus()
    expect(part('Review')).toHaveAttribute('aria-current', 'location')
    expect(within(review).getByText('Add your business name.')).toBeInTheDocument()
    expect(within(review).getByText('Add the name of the client.')).toBeInTheDocument()
    expect(within(review).getByText(/Add at least one line/)).toBeInTheDocument()
    expect(within(review).getByText('Needed before you can export')).toBeInTheDocument()
    expect(within(review).getByText('Worth adding')).toBeInTheDocument()
  })

  it('takes a founder from a missing thing to the part that fixes it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const review = screen.getByRole('region', { name: GUIDE_TITLES.review })
    await user.click(within(review).getByRole('button', { name: /Add the name of the client\. Go and fix it/ }))
    expect(clientName()).toHaveFocus()
    expect(part('Client')).toHaveAttribute('aria-current', 'location')
  })

  it('is ready, and exports, once the business, the client and a line are filled in', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(businessName(), 'Kindred Gifting')
    await user.type(clientName(), 'Pretoria Print Works')
    await user.type(screen.getAllByLabelText('Description').filter((element) => element.tagName === 'INPUT')[0], 'Gift box')
    await user.type(screen.getByLabelText('Price each, in rand'), '450')
    expect(['Business', 'VAT', 'Client', 'Items', 'Details', 'Review'].map(isDone)).toEqual([true, true, true, true, true, true])
    expect(exportButton()).not.toHaveAttribute('aria-disabled')
  })

  it('shows the total, worked out, under the line items, and ticks Items once the lines are whole', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Price each, in rand'), '450')
    // a price with no description is not a whole line yet
    expect(isDone('Items')).toBe(false)
    await user.type(screen.getAllByLabelText('Description').filter((element) => element.tagName === 'INPUT')[0], 'Gift box')
    expect(isDone('Items')).toBe(true)
    expect(screen.getByRole('region', { name: GUIDE_TITLES.lines }).textContent?.replace(/[\s ]/g, ' ')).toContain('R 450,00')
  })

  it('turns VAT on, which makes it a tax invoice that needs a VAT number', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(businessName(), 'Kindred')
    await user.click(screen.getByRole('switch', { name: 'I am registered for VAT' }))
    expect(isDone('VAT')).toBe(false)
    expect(screen.getByLabelText(/^Tax invoice/)).toBeInTheDocument()
    const review = screen.getByRole('region', { name: GUIDE_TITLES.review })
    expect(within(review).getByText('Add your VAT number. A tax invoice must show it.')).toBeInTheDocument()
    expect(within(review).getByText('Add your business address. A tax invoice must show it.')).toBeInTheDocument()
  })

  it('does not save when Save is pressed: it says what would be remembered and keeps nothing until it is confirmed', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    // what was saved is read first, so the bar says nothing for a moment
    expect(await screen.findByText('Not saved yet')).toBeInTheDocument()
    await user.type(businessName(), 'Kindred Gifting')
    await user.type(clientName(), 'Pretoria Print Works')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const note = screen.getByRole('dialog', { name: 'Save to DuckStack' })
    expect(within(note).getByRole('checkbox', { name: /Your business details/ })).toBeChecked()
    expect(within(note).getByRole('checkbox', { name: /Pretoria Print Works/ })).toBeChecked()
    expect(within(note).getByRole('checkbox', { name: /Invoice INV-0001/ })).toBeChecked()
    expect(note).not.toHaveTextContent(/arranged/)
    expect(memory()).toBeNull()
    await user.click(within(note).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(memory()).toBeNull()
    expect(screen.getByText('Not saved yet')).toBeInTheDocument()
  })

  it('remembers the business, the client and the invoice once they are confirmed, and says so', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(businessName(), 'Kindred Gifting')
    await user.type(clientName(), 'Pretoria Print Works')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
    expect(memory()?.business?.details.name).toBe('Kindred Gifting')
    expect(memory()?.clients.map((saved) => saved.client.name)).toEqual(['Pretoria Print Works'])
    expect(memory()?.invoices).toHaveLength(1)
    expect(memory()?.invoices[0]).toMatchObject({ revision: 1, content: { details: { number: 'INV-0001' } } })
    await user.type(businessName(), '!')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('remembers only what is ticked', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(businessName(), 'Kindred Gifting')
    await user.type(clientName(), 'Pretoria Print Works')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('checkbox', { name: /Pretoria Print Works/ }))
    await user.click(screen.getByRole('checkbox', { name: /Invoice INV-0001/ }))
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    expect(memory()?.business?.details.name).toBe('Kindred Gifting')
    expect(memory()?.clients).toEqual([])
    expect(memory()?.invoices).toEqual([])
    expect(screen.getByText('Not saved yet')).toBeInTheDocument()
  })

  it('writes no arrangement: only the memory is kept when something is confirmed', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(businessName(), 'Kindred Gifting')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    await waitFor(() => expect(memory()).not.toBeNull())
    expect(window.localStorage.getItem('droplet-project-duckstack-invoice')).toBeNull()
  })

  it('keeps the number of an invoice that is changed and confirmed again, as a new revision of the same invoice', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(clientName(), 'Pretoria')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    await user.type(clientName(), ' Print Works')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('A new version of it. It keeps its number.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    expect(memory()?.invoices).toHaveLength(1)
    expect(memory()?.invoices[0]).toMatchObject({ revision: 2, content: { details: { number: 'INV-0001' }, client: { name: 'Pretoria Print Works' } } })
  })

  it('starts the next invoice with the business already on it and the next number', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(businessName(), 'Kindred Gifting')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    await newInvoice(user)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^Invoice INV-0002/)).toBeInTheDocument()
    expect(businessName()).toHaveValue('Kindred Gifting')
    expect(clientName()).toHaveValue('')
  })

  it('fills in a client who is remembered from the saved clients in the Client part', async () => {
    const user = userEvent.setup()
    const client = { name: 'Pretoria Print Works', contact: '', address: '5 Church Square', email: '', vatNumber: '', reference: '' }
    window.localStorage.setItem('droplet-project-duckstack-memory', JSON.stringify({ business: null, clients: [{ id: 'c1', client, confirmedAt: 'x' }], invoices: [] }))
    render(<Harness />)
    await user.click(await screen.findByRole('button', { name: 'Use Pretoria Print Works' }))
    expect(screen.getByLabelText(/^Invoice INV-0001/)).toHaveTextContent('5 Church Square')
    expect(clientName()).toHaveValue('Pretoria Print Works')
    expect(isDone('Client')).toBe(true)
  })

  it('asks before leaving an invoice with changes nobody saved, and leaves nothing behind if it stays', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(clientName(), 'Pretoria')
    await newInvoice(user)
    const alert = screen.getByRole('alertdialog', { name: 'Leave INV-0001?' })
    expect(alert).toHaveTextContent('If you leave, they are lost.')
    await user.click(within(alert).getByRole('button', { name: 'Stay' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(clientName()).toHaveValue('Pretoria')
    await newInvoice(user)
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }))
    expect(clientName()).toHaveValue('')
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
    await user.type(clientName(), 'Pretoria')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(clientName()).toHaveValue('')
  })
})

describe('Guide mode', () => {
  it('shows one part at a time, the first to begin with, with the count and Back and Continue under it', () => {
    render(<Harness mode="guide" />)
    expect(screen.getByRole('region', { name: GUIDE_TITLES.business })).toBeInTheDocument()
    for (const id of GUIDE_STEPS.slice(1)) expect(screen.queryByRole('region', { name: GUIDE_TITLES[id] })).not.toBeInTheDocument()
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  })

  it('marks the current part on the bar as the step, and shows the parts further on but does not go to them', async () => {
    const user = userEvent.setup()
    render(<Harness mode="guide" />)
    expect(part('Business')).toHaveAttribute('aria-current', 'step')
    expect(part('Review')).toHaveAttribute('aria-disabled', 'true')
    expect(part('Review')).toHaveTextContent('not reached yet')
    await user.click(part('Review'))
    expect(screen.queryByRole('region', { name: GUIDE_TITLES.review })).not.toBeInTheDocument()
    expect(part('Business')).toHaveAttribute('aria-current', 'step')
  })

  it('does not move on while something required is missing, and names it', async () => {
    const user = userEvent.setup()
    render(<Harness mode="guide" />)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Before you go on:')
    expect(screen.getByRole('alert')).toHaveTextContent('Add your business name.')
    expect(screen.getByRole('region', { name: GUIDE_TITLES.business })).toBeInTheDocument()
  })

  it('moves on once the part is whole, and goes back to a part already reached from the bar', async () => {
    const user = userEvent.setup()
    render(<Harness mode="guide" />)
    await user.type(businessName(), 'Kindred Gifting')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('region', { name: GUIDE_TITLES.vat })).toBeInTheDocument()
    expect(part('VAT')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Step 2 of 6')).toBeInTheDocument()
    await user.click(part('Business'))
    expect(await screen.findByRole('region', { name: GUIDE_TITLES.business })).toBeInTheDocument()
    // forward again, as far as the founder got
    await user.click(part('VAT'))
    expect(await screen.findByRole('region', { name: GUIDE_TITLES.vat })).toBeInTheDocument()
  })

  it('sends a Fix on the review straight to the step that fixes it', async () => {
    const user = userEvent.setup()
    render(<Harness mode="guide" />)
    // the export button goes to Review
    await user.click(exportButton())
    expect(await screen.findByRole('region', { name: GUIDE_TITLES.review })).toBeInTheDocument()
    expect(part('Review')).toHaveAttribute('aria-current', 'step')
    await user.click(screen.getByRole('button', { name: /Add the name of the client\. Go and fix it/ }))
    expect(await screen.findByRole('region', { name: GUIDE_TITLES.client })).toBeInTheDocument()
    expect(part('Client')).toHaveAttribute('aria-current', 'step')
  })

  it('offers Finish on the last part, held back while something required is missing', async () => {
    const user = userEvent.setup()
    render(<Harness mode="guide" />)
    await user.click(exportButton())
    expect(await screen.findByRole('button', { name: 'Finish' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Before you can finish:')
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
    await user.type(businessName(), 'Kindred Gifting')
    await user.type(clientName(), 'Pretoria Print Works')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and save' }))
    // only the memory is written: how the workspace is arranged is not kept
    await waitFor(() => expect([...slow.documents.keys()].sort()).toEqual(['duckstack/memory']))
    expect(window.localStorage.length).toBe(0)
  })
})
