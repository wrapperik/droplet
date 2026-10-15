import { useCallback, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { newContent } from '../../lib/invoice.ts'
import { invoiceDocOf, openInvoiceWorkspace, reduceInvoice, type InvoiceAction } from '../../lib/invoiceState.ts'
import LineItemsEditor from './LineItemsEditor.tsx'

// The editor wired to the real reducer, as the workspace does, so what is typed goes where it goes in the app.
function Harness({ vat = false }: { vat?: boolean }) {
  const [state, setState] = useState(() => openInvoiceWorkspace({ ...newContent('2026-10-04'), vatRegistered: vat }))
  const dispatch = useCallback((action: InvoiceAction) => setState((current) => reduceInvoice(current, action)), [])
  const { content } = invoiceDocOf(state)
  return (
    <>
      <LineItemsEditor lines={content.lines} vatRegistered={content.vatRegistered} dispatch={dispatch} />
      <button type="button" onClick={() => dispatch({ type: 'undo' })}>
        Undo
      </button>
      <output data-testid="lines">{JSON.stringify(content.lines)}</output>
    </>
  )
}

const lines = () => JSON.parse(screen.getByTestId('lines').textContent!) as { id: number; description: string; quantity: number; unitCents: number | null }[]
const price = (row = 0) => screen.getAllByLabelText('Price each, in rand')[row] as HTMLInputElement
const quantity = (row = 0) => screen.getAllByLabelText('Quantity')[row] as HTMLInputElement
const description = (row = 0) => screen.getAllByLabelText('Description').filter((element) => element.tagName === 'INPUT')[row] as HTMLInputElement

describe('LineItemsEditor', () => {
  it('starts with one blank line to type in, and no complaint about it', () => {
    render(<Harness />)
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(1)
    expect(description()).toHaveValue('')
    expect(screen.queryByText(/needs/)).not.toBeInTheDocument()
  })

  it('takes a description, a quantity and a price, and works out the amount in code', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(description(), 'Gift box')
    await user.clear(quantity())
    await user.type(quantity(), '12')
    await user.type(price(), '450')
    expect(lines()[0]).toEqual({ id: 1, description: 'Gift box', quantity: 12, unitCents: 45000 })
    expect(screen.getByLabelText('Amount for line 1').textContent?.replace(/\s/g, ' ')).toBe('R 5 400,00')
  })

  it('reads a price typed with a comma or a currency sign, and shows it back as it was understood when the field is left', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(price(), 'R 450,5')
    expect(lines()[0].unitCents).toBe(45050)
    await user.tab()
    expect(price()).toHaveValue('450.50')
  })

  it('does not change the price while it is not a price, and says so', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(price(), '450')
    await user.type(price(), 'x')
    expect(lines()[0].unitCents).toBe(45000)
    expect(price()).toHaveAttribute('aria-invalid', 'true')
    await user.tab()
    expect(price()).toHaveValue('450.00')
    expect(price()).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('clears the price when the field is emptied', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(price(), '450')
    await user.clear(price())
    expect(lines()[0].unitCents).toBeNull()
  })

  it('keeps a quantity that is not valid out of the line, and marks it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.clear(quantity())
    await user.type(quantity(), '0')
    expect(lines()[0].quantity).toBe(1)
    expect(quantity()).toHaveAttribute('aria-invalid', 'true')
    await user.clear(quantity())
    await user.type(quantity(), '2,5')
    expect(lines()[0].quantity).toBe(2.5)
  })

  it('names what a begun line still needs, and says it is not counted without a price', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(description(), 'Gift box')
    expect(screen.getByText(/Line 1 needs a price/)).toBeInTheDocument()
    expect(screen.getByText(/not counted in the total until it has a price/)).toBeInTheDocument()
    expect(price()).toHaveAttribute('aria-invalid', 'true')
    await user.type(price(), '10')
    expect(screen.queryByText(/needs/)).not.toBeInTheDocument()
  })

  it('adds a line, moves it, and removes it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(description(0), 'First')
    await user.click(screen.getByRole('button', { name: 'Add a line' }))
    await user.type(description(1), 'Second')
    expect(lines().map((line) => line.description)).toEqual(['First', 'Second'])
    await user.click(screen.getByRole('button', { name: 'Move line 2 up' }))
    expect(lines().map((line) => line.description)).toEqual(['Second', 'First'])
    expect(screen.getByRole('button', { name: 'Move line 1 up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move line 2 down' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Remove line 1' }))
    expect(lines().map((line) => line.description)).toEqual(['First'])
  })

  it('clears the last line instead of removing it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(description(), 'Only')
    await user.click(screen.getByRole('button', { name: 'Remove line 1' }))
    expect(lines()).toHaveLength(1)
    expect(lines()[0].description).toBe('')
  })

  it('shows what an undo does to a half typed price, instead of keeping the draft', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(price(), '450')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(lines()[0].unitCents).toBeNull()
    expect(price()).toHaveValue('')
  })

  it('keeps a line in mind with a star, which can be taken off again and is taken back by undo', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const star = screen.getByRole('button', { name: 'Keep line 1 in mind' })
    expect(star).toHaveAttribute('aria-pressed', 'false')
    await user.click(star)
    expect(screen.getByRole('button', { name: 'Keep line 1 in mind' })).toHaveAttribute('aria-pressed', 'true')
    expect((lines()[0] as { starred?: boolean }).starred).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: 'Keep line 1 in mind' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: 'Keep line 1 in mind' }))
    await user.click(screen.getByRole('button', { name: 'Keep line 1 in mind' }))
    expect(screen.getByRole('button', { name: 'Keep line 1 in mind' })).toHaveAttribute('aria-pressed', 'false')
  })
})
