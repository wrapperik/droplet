import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Home from './Home.tsx'

// Home with the composer's server standing in: what is asked of it is recorded, and what it says back is what the test decides.
type Asked = { intent: string; view?: string; invoice?: { lines: { description: string }[] }; workspace?: unknown }
let asked: Asked[] = []
let answers: unknown[] = []

const reply = (task: string, message: string, actions: unknown[] = []) => ({ outcome: 'valid', turn: { task, message, actions, memoryUsed: [] } })

beforeEach(() => {
  window.localStorage.clear()
  asked = []
  answers = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      asked.push(JSON.parse(init.body))
      const body = answers[Math.min(asked.length - 1, answers.length - 1)]
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
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

const say = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.type(screen.getByLabelText('Describe what you need'), text)
  await user.click(screen.getByRole('button', { name: 'Send' }))
}

describe('asking Droplet to fill in the invoice', () => {
  it('fills in the invoice that is on screen, from what the founder said, in one step', async () => {
    const user = userEvent.setup()
    answers = [
      reply('invoice', 'I added the box.', [
        { type: 'set_client', name: 'Karoo Candles' },
        { type: 'add_line', description: 'Soy candle', quantity: 30, unitPrice: 'R85' },
      ]),
    ]
    renderHome()
    await user.click(screen.getByRole('button', { name: /Make an invoice/ }))
    await say(user, 'Bill Karoo Candles for 30 soy candles at R85 each')
    await waitFor(() => expect(screen.getByText('I added the box.')).toBeInTheDocument())
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({ view: 'invoice' })
    expect(asked[0].workspace).toBeUndefined()
    expect(screen.getByLabelText('Client name')).toHaveValue('Karoo Candles')
    expect(screen.getByLabelText(/^Invoice INV-0001/)).toHaveTextContent('Soy candle')
    expect(screen.getByLabelText('Price each, in rand')).toHaveValue('85.00')
    // one undo takes back everything it did
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByLabelText('Client name')).toHaveValue('')
    expect(screen.getByLabelText('Price each, in rand')).toHaveValue('')
  })

  it('refuses the whole answer, and changes nothing, when it holds a price the founder did not write', async () => {
    const user = userEvent.setup()
    answers = [
      reply('invoice', 'I added both lines.', [
        { type: 'add_line', description: 'Soy candle', quantity: 30, unitPrice: '85' },
        { type: 'set_terms', terms: '7' },
      ]),
    ]
    renderHome()
    await user.click(screen.getByRole('button', { name: /Make an invoice/ }))
    // the answer is checked again in the browser, which refuses a price nobody wrote even if the server let it through
    await say(user, 'Add 30 soy candles, due in 7 days')
    await waitFor(() => expect(screen.getByText(/I got an answer I could not use/)).toBeInTheDocument())
    expect(screen.getByLabelText('Price each, in rand')).toHaveValue('')
  })

  it('opens the invoice and asks again when the request belongs there and no invoice is open, then fills it in', async () => {
    const user = userEvent.setup()
    answers = [
      reply('invoice', 'I am opening the invoice workspace.'),
      reply('invoice', 'I added the line.', [{ type: 'add_line', description: 'Gift box', quantity: 12, unitPrice: '450' }]),
    ]
    renderHome()
    await say(user, 'Invoice them for 12 gift boxes at 450')
    await waitFor(() => expect(screen.getByText('I added the line.')).toBeInTheDocument())
    expect(asked).toHaveLength(2)
    expect(asked[0].view).toBeUndefined()
    expect(asked[1]).toMatchObject({ view: 'invoice', intent: 'Invoice them for 12 gift boxes at 450' })
    expect(asked[1].invoice?.lines).toHaveLength(1)
    expect(screen.getByText('I am opening the invoice workspace.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Invoice INV-0001/)).toHaveTextContent('Gift box')
  })

  it('asks again only once, however the second answer comes back', async () => {
    const user = userEvent.setup()
    answers = [reply('invoice', 'Opening the invoice.'), reply('brand', 'That is about colours.')]
    renderHome()
    await say(user, 'invoice colours')
    await waitFor(() => expect(screen.getByText('That is about colours.')).toBeInTheDocument())
    expect(asked).toHaveLength(2)
  })

  it('opens the palette and asks again when the invoice is on screen and the request is about colours', async () => {
    const user = userEvent.setup()
    answers = [reply('brand', 'Opening the brand workspace.'), reply('brand', 'Colour 1 reads best.')]
    renderHome()
    await user.click(screen.getByRole('button', { name: /Make an invoice/ }))
    await say(user, 'Which brand colour has the best contrast?')
    await waitFor(() => expect(screen.getByText('Colour 1 reads best.')).toBeInTheDocument())
    expect(asked[0].view).toBe('invoice')
    expect(asked[1].view).toBe('brand')
    expect(asked[1].workspace).toBeDefined()
    await waitFor(() => expect(within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('group', { name: 'Colour picker' })).toBeInTheDocument())
  })

  it('leaves the invoice alone when the composer only answers', async () => {
    const user = userEvent.setup()
    answers = [reply('invoice', 'It still needs the name of the client.')]
    renderHome()
    await user.click(screen.getByRole('button', { name: /Make an invoice/ }))
    await say(user, 'What does it still need?')
    await waitFor(() => expect(screen.getByText('It still needs the name of the client.')).toBeInTheDocument())
    expect(screen.getByLabelText('Client name')).toHaveValue('')
  })

  it('does not send the founder\'s address, bank details or contacts to the composer', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(
      'droplet-project-duckstack-memory',
      JSON.stringify({
        business: { details: { name: 'Kindred Gifting', address: '12 Jacaranda Street', email: 'hello@kindred.example', phone: '082 000 0000', vatNumber: '', accountHolder: 'Kindred', bankName: 'FNB', accountNumber: '62000000000', branchCode: '250655' }, confirmedAt: 'x' },
        clients: [],
        invoices: [],
      }),
    )
    answers = [reply('invoice', 'Fine.')]
    renderHome()
    await user.click(screen.getByRole('button', { name: /Make an invoice/ }))
    await say(user, 'What is the total?')
    await waitFor(() => expect(asked).toHaveLength(1))
    const sent = JSON.stringify(asked[0])
    for (const secret of ['Jacaranda', 'hello@kindred', '082 000', '62000000000', 'FNB', '250655']) expect(sent, secret).not.toContain(secret)
    expect(asked[0].invoice).toMatchObject({ business: { name: 'Kindred Gifting', hasAddress: true, hasBankDetails: true } })
  })
})
