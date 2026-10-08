import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveBoard } from '../lib/boardStore.ts'
import { emptyBusiness, emptyClient, newContent, type InvoiceContent } from '../lib/invoice.ts'
import { loadMemory, saveMemory } from '../lib/memoryStore.ts'
import { emptyMemory, withBusiness, withClient, withFact, withIdea, withInvoice } from '../lib/projectMemory.ts'
import { loadPalette, savePalette } from '../lib/projectStore.ts'
import Library from './Library.tsx'

const exports = vi.hoisted(() => ({
  brandSheet: vi.fn(async (..._args: unknown[]) => true),
  board: vi.fn(async (..._args: unknown[]) => true),
  invoice: vi.fn(async (..._args: unknown[]) => true),
}))
vi.mock('../lib/exportSheet.ts', () => ({ exportBrandSheet: exports.brandSheet }))
vi.mock('../lib/boardExport.ts', async (original) => ({ ...(await original<typeof import('../lib/boardExport.ts')>()), exportBoard: exports.board }))
vi.mock('../lib/exportInvoice.ts', () => ({ exportInvoice: exports.invoice }))

const PROJECT = 'kindred'
const business = { ...emptyBusiness(), name: 'Kindred Gifting', address: '12 Jacaranda Street' }
const client = { ...emptyClient(), name: 'Pretoria Print Works', address: '5 Church Square' }
const complete = (number: string): InvoiceContent => ({ ...newContent('2026-10-04', number), business, client, lines: [{ id: 1, description: 'Gift boxes', quantity: 12, unitCents: 45_000 }] })
const note = { id: 'a', kind: 'note' as const, x: 0, y: 0, w: 200, h: 180, text: 'Hampers', colour: 'yellow' as const, author: 'you' as const }

const fill = async () => {
  let memory = withBusiness(emptyMemory(), business, '2026-10-01T08:00:00.000Z')
  memory = withClient(memory, client, '2026-10-01T08:00:00.000Z', 'c1')
  memory = withInvoice(memory, 'i1', complete('INV-0001'), '2026-10-02T08:00:00.000Z')
  memory = withInvoice(memory, 'i2', complete('INV-0002'), '2026-10-03T08:00:00.000Z')
  memory = withIdea(memory, 'name', 'Kindred Gifting', '2026-10-05T10:00:00.000Z')
  memory = withFact(memory, 'logo.status', 'Not started', '2026-10-05T10:00:00.000Z')
  await saveMemory(PROJECT, memory)
  await savePalette(PROJECT, { blocks: [{ id: 1, hex: '#0E1A2B', role: 'text' }, { id: 2, hex: '#F4F8FB', role: 'background' }], layout: [] })
  await saveBoard(PROJECT, { items: [note], layout: [] })
}

const setup = (overrides: Partial<React.ComponentProps<typeof Library>> = {}) => {
  const props = {
    projectId: PROJECT,
    projectName: 'Kindred Gifting',
    onClose: vi.fn(),
    onOpen: vi.fn(async () => 'done' as const),
    onAsk: vi.fn(),
    onChanged: vi.fn(),
    ...overrides,
  }
  render(<Library {...props} />)
  return props
}

const section = (name: string) => screen.getByRole('region', { name })

beforeEach(() => {
  window.localStorage.clear()
  Object.values(exports).forEach((mock) => mock.mockClear().mockResolvedValue(true))
})

describe('the library screen', () => {
  it('on a project with nothing saved, says what makes each thing and offers the workspace', async () => {
    const props = setup()
    expect(await screen.findByText(/No palette is saved/)).toBeInTheDocument()
    expect(section('Logo')).toHaveTextContent('Made outside Droplet')
    await userEvent.click(within(section('Brand')).getByRole('button', { name: 'Build the brand' }))
    expect(props.onOpen).toHaveBeenCalledWith({ kind: 'brand' }, { confirmed: false })
    await userEvent.click(within(section('Invoices')).getByRole('button', { name: 'Make an invoice' }))
    expect(props.onOpen).toHaveBeenCalledWith({ kind: 'new_invoice' }, { confirmed: false })
  })

  it('lists what is saved, in sections', async () => {
    await fill()
    setup()
    expect(await within(await screen.findByRole('region', { name: 'Business' })).findByText('Kindred Gifting')).toBeInTheDocument()
    expect(within(section('Brand')).getByText(/Text on background 16.4:1/)).toBeInTheDocument()
    expect(within(section('Ideas')).getByText('1 note, 0 frames')).toBeInTheDocument()
    const invoices = within(section('Invoices')).getAllByRole('listitem')
    expect(invoices).toHaveLength(2)
    expect(invoices[0]).toHaveTextContent('Invoice INV-0002')
    expect(invoices[0]).toHaveTextContent('Not exported yet')
    expect(within(section('Clients')).getByText('Pretoria Print Works')).toBeInTheDocument()
    expect(within(section('Business details')).getByText('Address: filled in')).toBeInTheDocument()
    expect(within(section('Business details')).queryByText(/Jacaranda/)).not.toBeInTheDocument()
  })

  it('goes back', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(props.onClose).toHaveBeenCalled()
  })

  it('opens the things it lists', async () => {
    await fill()
    const props = setup()
    const invoices = await within(await screen.findByRole('region', { name: 'Invoices' })).findAllByRole('listitem')
    await userEvent.click(within(invoices[0]).getByRole('button', { name: 'Open Invoice INV-0002' }))
    expect(props.onOpen).toHaveBeenCalledWith({ kind: 'invoice', id: 'i2' }, { confirmed: false })
    await userEvent.click(within(invoices[1]).getByRole('button', { name: 'Make a new invoice from Invoice INV-0001' }))
    expect(props.onOpen).toHaveBeenCalledWith({ kind: 'copy_invoice', id: 'i1' }, { confirmed: false })
    await userEvent.click(within(section('Clients')).getByRole('button', { name: 'New invoice for Pretoria Print Works' }))
    expect(props.onOpen).toHaveBeenCalledWith({ kind: 'new_invoice', clientId: 'c1' }, { confirmed: false })
    await userEvent.click(within(section('Brand')).getByRole('button', { name: 'Open the palette' }))
    expect(props.onOpen).toHaveBeenCalledWith({ kind: 'brand' }, { confirmed: false })
    await userEvent.click(within(section('Ideas')).getByRole('button', { name: 'Open the board' }))
    expect(props.onOpen).toHaveBeenCalledWith({ kind: 'board' }, { confirmed: false })
    await userEvent.click(within(section('Business details')).getByRole('button', { name: /Edit your business details/ }))
    expect(props.onOpen).toHaveBeenCalledWith({ kind: 'business_details' }, { confirmed: false })
  })

  it('asks before replacing an invoice that is open with unsaved changes, and goes ahead only on a yes', async () => {
    await fill()
    const onOpen = vi.fn(async (_target: unknown, options?: { confirmed?: boolean }) => (options?.confirmed ? ('done' as const) : ('unsaved' as const)))
    setup({ onOpen })
    const invoices = await within(await screen.findByRole('region', { name: 'Invoices' })).findAllByRole('listitem')
    await userEvent.click(within(invoices[0]).getByRole('button', { name: 'Open Invoice INV-0002' }))
    expect(screen.getByRole('alert')).toHaveTextContent('changes that are not saved')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Open anyway' })).not.toBeInTheDocument()
    await userEvent.click(within(invoices[0]).getByRole('button', { name: 'Open Invoice INV-0002' }))
    await userEvent.click(screen.getByRole('button', { name: 'Open anyway' }))
    expect(onOpen).toHaveBeenLastCalledWith({ kind: 'invoice', id: 'i2' }, { confirmed: true })
    expect(screen.queryByRole('button', { name: 'Open anyway' })).not.toBeInTheDocument()
  })

  it('exports the brand sheet and says so, and the palette shows it was exported', async () => {
    await fill()
    const props = setup()
    await userEvent.click(await within(await screen.findByRole('region', { name: 'Brand' })).findByRole('button', { name: 'Export brand sheet' }))
    expect(await screen.findByRole('status')).toHaveTextContent('The brand sheet was downloaded.')
    expect(exports.brandSheet).toHaveBeenCalledTimes(1)
    expect(props.onChanged).toHaveBeenCalled()
    expect(await within(section('Brand')).findByText(/Brand sheet exported/)).toBeInTheDocument()
    expect((await loadPalette(PROJECT))?.exportedAt).toBeTruthy()
  })

  it('exports the board as a PNG or a PDF', async () => {
    await fill()
    setup()
    const ideas = await screen.findByRole('region', { name: 'Ideas' })
    await userEvent.click(within(ideas).getByRole('button', { name: 'Export PNG' }))
    await waitFor(() => expect(exports.board).toHaveBeenCalledWith('png', expect.anything()))
    await userEvent.click(within(ideas).getByRole('button', { name: 'Export PDF' }))
    await waitFor(() => expect(exports.board).toHaveBeenCalledWith('pdf', expect.anything()))
  })

  it('exports an invoice, which then reads as exported', async () => {
    await fill()
    setup()
    const invoices = await within(await screen.findByRole('region', { name: 'Invoices' })).findAllByRole('listitem')
    await userEvent.click(within(invoices[0]).getByRole('button', { name: 'Export Invoice INV-0002 as a PDF' }))
    expect(await within(section('Invoices')).findByText(/Exported \d+ \w+/)).toBeInTheDocument()
    expect(exports.invoice).toHaveBeenCalledTimes(1)
  })

  it('names what is missing instead of exporting an invoice that is not ready, and says so as an alert', async () => {
    await saveMemory(PROJECT, withInvoice(emptyMemory(), 'i9', { ...complete('INV-0009'), client: emptyClient() }, '2026-10-05T08:00:00.000Z'))
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Export Invoice INV-0009 as a PDF' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not ready to export/i)
    expect(exports.invoice).not.toHaveBeenCalled()
  })

  it('forgets an invoice only after asking twice', async () => {
    await fill()
    const props = setup()
    const invoices = await within(await screen.findByRole('region', { name: 'Invoices' })).findAllByRole('listitem')
    await userEvent.click(within(invoices[0]).getByRole('button', { name: 'Forget Invoice INV-0002' }))
    // Nothing is forgotten by the first press.
    expect((await loadMemory(PROJECT)).invoices).toHaveLength(2)
    expect(within(invoices[0]).getByText('Forget Invoice INV-0002?')).toBeInTheDocument()
    await userEvent.click(within(invoices[0]).getByRole('button', { name: 'Keep' }))
    expect((await loadMemory(PROJECT)).invoices).toHaveLength(2)
    await userEvent.click(within(invoices[0]).getByRole('button', { name: 'Forget Invoice INV-0002' }))
    await userEvent.click(within(invoices[0]).getByRole('button', { name: 'Forget' }))
    await waitFor(async () => expect((await loadMemory(PROJECT)).invoices.map((invoice) => invoice.id)).toEqual(['i1']))
    expect(await screen.findByText('Forgot Invoice INV-0002.')).toBeInTheDocument()
    expect(props.onChanged).toHaveBeenCalled()
  })

  it('forgets a client after asking, and the name and offer after asking', async () => {
    await fill()
    setup()
    const clients = await screen.findByRole('region', { name: 'Clients' })
    await userEvent.click(within(clients).getByRole('button', { name: 'Forget Pretoria Print Works' }))
    await userEvent.click(within(clients).getByRole('button', { name: 'Forget' }))
    await waitFor(async () => expect((await loadMemory(PROJECT)).clients).toEqual([]))
    const business = section('Business')
    await userEvent.click(within(business).getByRole('button', { name: 'Forget the name and the offer' }))
    expect((await loadMemory(PROJECT)).idea?.name).toBe('Kindred Gifting')
    await userEvent.click(within(business).getByRole('button', { name: 'Forget' }))
    await waitFor(async () => expect((await loadMemory(PROJECT)).idea).toBeUndefined())
  })

  it('copies the hex codes', async () => {
    await fill()
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Copy hex codes' }))
    expect(writeText).toHaveBeenCalledWith('#0E1A2B, #F4F8FB')
    expect(await screen.findByRole('status')).toHaveTextContent('Copied the hex codes.')
  })

  it('asks Droplet for a logo brief, and shows what the founder said about the logo', async () => {
    await fill()
    const props = setup()
    expect(await screen.findByText(/What you told Droplet: Not started/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ask Droplet to help make a logo brief' }))
    expect(props.onAsk).toHaveBeenCalledWith('Help me write a short brief for my logo.')
  })

  it('reads again when told something changed', async () => {
    const { rerender } = render(<Library projectId={PROJECT} projectName="Kindred" version={0} onClose={() => {}} onOpen={async () => 'done'} onAsk={() => {}} />)
    expect(await screen.findByText(/No palette is saved/)).toBeInTheDocument()
    await fill()
    rerender(<Library projectId={PROJECT} projectName="Kindred" version={1} onClose={() => {}} onOpen={async () => 'done'} onAsk={() => {}} />)
    expect(await screen.findByText(/Text on background/)).toBeInTheDocument()
  })
})
