import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyBusiness, emptyClient, newContent, type InvoiceContent } from '../lib/invoice.ts'
import { saveMemory } from '../lib/memoryStore.ts'
import { emptyMemory, withBusiness, withClient, withInvoice } from '../lib/projectMemory.ts'
import { savePalette } from '../lib/projectStore.ts'
import { useWorkMode } from '../store/workMode.ts'
import Home from './Home.tsx'

// Home with the library, and the composer's server standing in. The files themselves are not made: what is asked for is recorded.
const exports = vi.hoisted(() => ({ brandSheet: vi.fn(async (..._args: unknown[]) => true) }))
vi.mock('../lib/exportSheet.ts', () => ({ exportBrandSheet: exports.brandSheet }))

type Asked = { intent: string; view?: string; open?: string[]; library?: { brand: boolean; ideas: unknown; invoices: { number: string }[] } }
let asked: Asked[] = []
let answers: unknown[] = []

const PROJECT = 'duckstack'
const business = { ...emptyBusiness(), name: 'DuckStack', address: '1 Main Road' }
const client = { ...emptyClient(), name: 'Karoo Candles', address: '2 Karoo Way' }
const complete = (number: string): InvoiceContent => ({ ...newContent('2026-10-04', number), business, client, lines: [{ id: 1, description: 'Soy candle', quantity: 30, unitCents: 8_500 }] })

const turn = (task: string, message: string, actions: unknown[] = [], extra: object = {}) => ({ outcome: 'valid', answeredBy: 'base', turn: { task, message, actions, memoryUsed: [], ...extra } })

const seed = async () => {
  let memory = withBusiness(emptyMemory(), business, '2026-10-01T08:00:00.000Z')
  memory = withClient(memory, client, '2026-10-01T08:00:00.000Z', 'c1')
  memory = withInvoice(memory, 'i1', complete('INV-0001'), '2026-10-02T08:00:00.000Z')
  await saveMemory(PROJECT, memory)
  await savePalette(PROJECT, { blocks: [{ id: 1, hex: '#0E1A2B', role: 'text' }, { id: 2, hex: '#F4F8FB', role: 'background' }] })
}

beforeEach(() => {
  window.localStorage.clear()
  // The library's invoices open in Workspace mode here. Guide mode has tests of its own, in Home.test.tsx.
  useWorkMode.setState({ mode: 'workspace' })
  asked = []
  answers = []
  exports.brandSheet.mockClear().mockResolvedValue(true)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { method?: string; body: string }) => {
      if (init.method === 'GET') return new Response(JSON.stringify({ allowance: { advancedLeft: 10, advancedLimit: 10, resetsAt: null } }), { status: 200 })
      const sent = JSON.parse(init.body) as { kind?: string }
      if (sent.kind) return new Response(JSON.stringify({ kind: sent.kind, answeredBy: 'base', summary: null, digest: null }), { status: 200, headers: { 'content-type': 'application/json' } })
      asked.push(sent as never)
      return new Response(JSON.stringify(answers[Math.min(asked.length - 1, answers.length - 1)]), { status: 200, headers: { 'content-type': 'application/json' } })
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const renderHome = () =>
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  )

const openLibrary = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Library' }))
  return screen.findByRole('heading', { name: 'Library' })
}

const say = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.type(screen.getByLabelText('Describe what you need'), text)
  await user.click(screen.getByRole('button', { name: 'Send' }))
}

describe('the library in Home', () => {
  it('opens from the sidebar with the conversation beside it, marks its row, and goes back to the full chat when nothing else is open', async () => {
    const user = userEvent.setup()
    renderHome()
    expect(screen.queryByRole('complementary', { name: 'Conversation' })).not.toBeInTheDocument()
    await openLibrary(user)
    expect(screen.getByRole('complementary', { name: 'Conversation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    // The library fades out before it goes.
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Library' })).not.toBeInTheDocument())
    expect(screen.queryByRole('complementary', { name: 'Conversation' })).not.toBeInTheDocument()
  })

  it('closes again from its own row in the sidebar', async () => {
    const user = userEvent.setup()
    renderHome()
    await openLibrary(user)
    await user.click(screen.getByRole('button', { name: 'Library' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Library' })).not.toBeInTheDocument())
  })

  it('closes with Back to the full chat in the conversation, as the workspaces do', async () => {
    const user = userEvent.setup()
    renderHome()
    await openLibrary(user)
    await user.click(screen.getByRole('button', { name: /full chat/i }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Library' })).not.toBeInTheDocument())
  })

  it('opens the workspace for a section that has nothing in it, and gives way to it', async () => {
    const user = userEvent.setup()
    renderHome()
    await openLibrary(user)
    await user.click(await screen.findByRole('button', { name: 'Build the brand' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Library' })).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('returns to the workspace that was open, with its work, when closed', async () => {
    const user = userEvent.setup()
    renderHome()
    await user.click(screen.getByRole('button', { name: 'Choose a task' }))
    await user.click(await screen.findByRole('menuitem', { name: /Build the brand/ }))
    await screen.findByRole('button', { name: 'Save' })
    await openLibrary(user)
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('opens a saved invoice in the invoice workspace', async () => {
    await seed()
    const user = userEvent.setup()
    renderHome()
    await openLibrary(user)
    await user.click(await screen.findByRole('button', { name: 'Open Invoice INV-0001' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Library' })).not.toBeInTheDocument())
    expect(await screen.findByLabelText(/^Invoice INV-0001/)).toHaveTextContent('Karoo Candles')
  })

  it('asks before replacing an invoice that is open with changes that are not saved, and replaces it only on a yes', async () => {
    await seed()
    const user = userEvent.setup()
    renderHome()
    await user.click(screen.getByRole('button', { name: 'Choose a task' }))
    await user.click(await screen.findByRole('menuitem', { name: /Make an invoice/ }))
    // The invoice that opens is the saved one, so something is changed in it.
    await user.type(await screen.findByLabelText('Client or company name'), ' Ltd')
    await openLibrary(user)
    await user.click(await screen.findByRole('button', { name: 'Make a new invoice from Invoice INV-0001' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('changes that are not saved')
    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open anyway' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Library' })).not.toBeInTheDocument())
    expect(await screen.findByLabelText(/^Invoice INV-0002/)).toBeInTheDocument()
  })

  it('opens a new invoice for a client, with the client already on it', async () => {
    await seed()
    const user = userEvent.setup()
    renderHome()
    await openLibrary(user)
    await user.click(await screen.findByRole('button', { name: 'New invoice for Karoo Candles' }))
    expect(await screen.findByLabelText(/^Invoice INV-0002/)).toHaveTextContent('Karoo Candles')
  })

  it('opens the invoice with the business step ready, to edit the business details', async () => {
    await seed()
    const user = userEvent.setup()
    renderHome()
    await openLibrary(user)
    await user.click(await screen.findByRole('button', { name: /Edit your business details/ }))
    expect(await screen.findByLabelText(/Business name/i)).toBeInTheDocument()
  })
})

describe('opening a named palette from the library', () => {
  const summer = { id: 'a', name: 'Summer', savedAt: '2026-10-05T10:00:00.000Z', blocks: [{ id: 1, hex: '#B5543A' }, { id: 2, hex: '#F7EFE6' }, { id: 3, hex: '#3B2A22' }] }
  const hexes = () => [...document.querySelectorAll('.strip__hex')].map((hex) => hex.textContent)

  it('opens the brand workspace with that palette in it, and the name in the toolbar, as one step that undo takes back', async () => {
    await savePalette(PROJECT, { blocks: [{ id: 1, hex: '#0E1A2B', role: 'text' }, { id: 2, hex: '#F4F8FB', role: 'background' }], palettes: [summer] })
    const user = userEvent.setup()
    renderHome()
    await openLibrary(user)
    await user.click(await screen.findByRole('button', { name: 'Open the palette Summer' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Library' })).not.toBeInTheDocument())
    await waitFor(() => expect(hexes()).toEqual(['#B5543A', '#F7EFE6', '#3B2A22']))
    expect(await screen.findByRole('textbox', { name: 'Palette name' })).toHaveValue('Summer')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(hexes()).toEqual(['#0E1A2B', '#F4F8FB']))
  })

  it('puts it into a brand workspace that is already open, after asking if it has colours that are not saved', async () => {
    await savePalette(PROJECT, { blocks: [{ id: 1, hex: '#0E1A2B', role: 'text' }, { id: 2, hex: '#F4F8FB', role: 'background' }], palettes: [summer] })
    const user = userEvent.setup()
    renderHome()
    await user.click(screen.getByRole('button', { name: 'Choose a task' }))
    await user.click(await screen.findByRole('menuitem', { name: /Build the brand/ }))
    await screen.findByRole('button', { name: /^Saved?$/ })
    await user.click(screen.getByRole('button', { name: 'Add colour' }))
    await openLibrary(user)
    await user.click(await screen.findByRole('button', { name: 'Open the palette Summer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The palette you have open has changes that are not saved')
    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open anyway' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Library' })).not.toBeInTheDocument())
    await waitFor(() => expect(hexes()).toEqual(['#B5543A', '#F7EFE6', '#3B2A22']))
  })
})

describe('asking Droplet with the library open', () => {
  it('sends what the library holds, with no workspace on screen, and no address or amount', async () => {
    await seed()
    const user = userEvent.setup()
    answers = [turn('chat', 'You have a palette and one invoice.')]
    renderHome()
    await openLibrary(user)
    await say(user, 'what have I got?')
    await waitFor(() => expect(asked).toHaveLength(1))
    expect(asked[0].view).toBeUndefined()
    expect(asked[0].library).toMatchObject({ brand: true, ideas: null, invoices: [{ number: 'INV-0001', client: 'Karoo Candles' }] })
    expect(JSON.stringify(asked[0])).not.toMatch(/Karoo Way|1 Main Road|2550/)
  })

  it('opens a saved invoice when asked to, with the founder\'s words quoted, and the library gives way to it', async () => {
    await seed()
    const user = userEvent.setup()
    answers = [turn('invoice', 'Opening it now.', [{ type: 'open_item', item: 'invoice', which: 'last' }], { opens: { because: 'asked', quote: 'open my last invoice' } })]
    renderHome()
    await openLibrary(user)
    await say(user, 'open my last invoice')
    expect(await screen.findByLabelText(/^Invoice INV-0001/)).toHaveTextContent('Karoo Candles')
    expect(screen.queryByRole('heading', { name: 'Library' })).not.toBeInTheDocument()
  })

  it('refuses to open an invoice that is not saved, and opens nothing', async () => {
    const user = userEvent.setup()
    answers = [turn('invoice', 'Opening it now.', [{ type: 'open_item', item: 'invoice' }], { opens: { because: 'asked', quote: 'open my last invoice' } })]
    renderHome()
    await openLibrary(user)
    await say(user, 'open my last invoice')
    await waitFor(() => expect(screen.getByText(/I got an answer I could not use/)).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
  })

  it('exports the brand sheet when asked, from what is saved, and says so in the app\'s own words', async () => {
    await seed()
    const user = userEvent.setup()
    answers = [turn('brand', 'On it.', [{ type: 'export_item', item: 'brand' }])]
    renderHome()
    await openLibrary(user)
    await say(user, 'export my brand sheet')
    expect(await screen.findByText('The brand sheet was downloaded.')).toBeInTheDocument()
    expect(exports.brandSheet).toHaveBeenCalledTimes(1)
  })

  it('does not export an invoice that is not ready, and says what is missing', async () => {
    await saveMemory(PROJECT, withInvoice(emptyMemory(), 'i9', { ...complete('INV-0009'), client: emptyClient() }, '2026-10-05T08:00:00.000Z'))
    const user = userEvent.setup()
    answers = [turn('invoice', 'On it.', [{ type: 'export_item', item: 'invoice' }])]
    renderHome()
    await openLibrary(user)
    await say(user, 'export my last invoice')
    // The composer is told it is not ready, so a reply that exports it is sent back and then refused.
    await waitFor(() => expect(screen.getByText(/I got an answer I could not use/)).toBeInTheDocument())
  })
})
