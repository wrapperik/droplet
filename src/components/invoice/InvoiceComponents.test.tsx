import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { newContent, type InvoiceContent } from '../../lib/invoice.ts'
import { resolveRoles } from '../../lib/palette.ts'
import { starterBlocks } from '../../compose/fallback.ts'
import InvoiceDocument from './InvoiceDocument.tsx'
import { BusinessWindow, ClientWindow, DetailsWindow, TotalsWindow, VatWindow } from './InvoiceWindows.tsx'

const roles = resolveRoles(starterBlocks())
const plain = (text: string | null) => (text ?? '').replace(/[\s ]/g, ' ')

const complete = (): InvoiceContent => {
  const content = newContent('2026-10-04', 'INV-0007')
  content.business = { ...content.business, name: 'Kindred Gifting', address: '12 Jacaranda Street\nPretoria East', vatNumber: '4123456789' }
  content.client = { ...content.client, name: 'Pretoria Print Works' }
  content.lines = [
    { id: 1, description: 'Gift box, small', quantity: 12, unitCents: 45000 },
    { id: 2, description: 'Printed insert', quantity: 12, unitCents: null },
  ]
  content.vatRegistered = true
  return content
}

describe('InvoiceDocument', () => {
  it('is an invoice from the first moment, with faded placeholders for what is still to come', () => {
    const { container } = render(<InvoiceDocument content={newContent('2026-10-04')} roles={roles} reason="Why." />)
    expect(screen.getByLabelText(/^Invoice INV-0001/)).toBeInTheDocument()
    expect(screen.getByText('Your business name')).toHaveClass('paper__placeholder')
    expect(screen.getByText('Client name')).toHaveClass('paper__placeholder')
    expect(container.querySelector('tbody .paper__placeholder')).toHaveTextContent('Description')
    expect(container.querySelectorAll('.paper__placeholder').length).toBeGreaterThan(3)
    expect(plain(container.querySelector('.paper__total')!.textContent)).toContain('R 0,00')
  })

  it('shows a business registered for VAT as a tax invoice, with the VAT line and its number, and the total worked out', () => {
    const { container } = render(<InvoiceDocument content={complete()} roles={roles} reason="Why." />)
    expect(container.querySelector('.paper__kind')).toHaveTextContent('Tax invoice')
    expect(screen.getByText('Kindred Gifting')).toBeInTheDocument()
    expect(screen.getByText('VAT number 4123456789')).toBeInTheDocument()
    expect(screen.getByText('VAT (15%)')).toBeInTheDocument()
    expect(plain(container.querySelector('.paper__total')!.textContent)).toContain('R 6 210,00')
  })

  it('marks a line that is missing something, on screen', () => {
    const { container } = render(<InvoiceDocument content={complete()} roles={roles} reason="Why." />)
    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]).not.toHaveAttribute('data-incomplete')
    expect(rows[1]).toHaveAttribute('data-incomplete')
  })

  it('leaves out the VAT line for a business that is not registered', () => {
    const content = { ...complete(), vatRegistered: false }
    const { container } = render(<InvoiceDocument content={content} roles={roles} reason="Why." />)
    expect(container.querySelector('.paper__kind')).toHaveTextContent('Invoice')
    expect(screen.queryByText(/VAT \(/)).not.toBeInTheDocument()
  })

  it('draws itself in the brand: the palette roles are its colours', () => {
    const { container } = render(<InvoiceDocument content={complete()} roles={roles} reason="Why." />)
    const paper = container.querySelector('.paper') as HTMLElement
    expect(paper.style.getPropertyValue('--paper-primary')).toBe(roles.primary.hex)
    expect(paper.style.getPropertyValue('--paper-background')).toBe(roles.background.hex)
    expect(paper.style.getPropertyValue('--paper-text')).toBe(roles.text.hex)
  })
})

describe('the windows', () => {
  it('the business window changes one field at a time, and says where it is kept', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    render(<BusinessWindow business={newContent('2026-10-04').business} status="none" onForget={vi.fn()} dispatch={dispatch} reason="Why." />)
    await user.type(screen.getByLabelText('Branch code'), '2')
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'set_business', patch: { branchCode: '2' } })
    await user.type(screen.getByLabelText('Address'), 'x')
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'set_business', patch: { address: 'x' } })
    expect(screen.getByText('Kept on this device only.')).toBeInTheDocument()
  })

  it('the client window changes the client', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    render(<ClientWindow client={newContent('2026-10-04').client} status="none" remembered={[]} onForget={vi.fn()} dispatch={dispatch} reason="Why." />)
    await user.type(screen.getByLabelText('Their reference'), 'P')
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'set_client', patch: { reference: 'P' } })
  })

  it('the details window shows a date field for the due date only when it is a date the founder chooses, and says what the terms come to', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    const { rerender } = render(<DetailsWindow details={newContent('2026-10-04').details} dispatch={dispatch} reason="Why." />)
    expect(screen.getByText('That is 18 October 2026.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Due date')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Invoice number'), '9')
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'set_details', patch: { number: 'INV-00019' } })
    rerender(<DetailsWindow details={{ ...newContent('2026-10-04').details, terms: 'custom' }} dispatch={dispatch} reason="Why." />)
    expect(screen.getByLabelText('Due date')).toBeInTheDocument()
    expect(screen.getByText('Choose a date below.')).toBeInTheDocument()
  })

  it('the VAT window explains what the switch changes, and asks for the VAT number only when registered', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    const { rerender } = render(<VatWindow content={newContent('2026-10-04')} dispatch={dispatch} reason="Why." />)
    expect(screen.getByText(/plain invoice with no VAT/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Your VAT number')).not.toBeInTheDocument()
    await user.click(screen.getByRole('switch'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'set_vat_registered', value: true })
    rerender(<VatWindow content={complete()} dispatch={dispatch} reason="Why." />)
    expect(screen.getByText(/tax invoice. It charges 15% VAT/)).toBeInTheDocument()
    expect(screen.getByLabelText('Your VAT number')).toHaveValue('4123456789')
  })

  it('the totals window shows the working for each counted line and warns about one that is not counted', () => {
    render(<TotalsWindow content={complete()} reason="Why." />)
    const working = screen.getByRole('list')
    expect(within(working).getAllByRole('listitem')).toHaveLength(1)
    expect(plain(working.textContent)).toContain('12 × R 450,00')
    expect(plain(working.textContent)).toContain('R 5 400,00')
    expect(screen.getByText(/1 line is not counted because it has no price or quantity yet/)).toBeInTheDocument()
    expect(screen.getByText('VAT (15%)')).toBeInTheDocument()
  })

  it('the totals window says nothing is counted yet when no line is', () => {
    render(<TotalsWindow content={newContent('2026-10-04')} reason="Why." />)
    expect(screen.getByText(/Nothing is counted yet/)).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})
