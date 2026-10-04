import { useId } from 'react'
import { TERMS, computeTotals, dueDateOf, formatDate, type InvoiceContent, type InvoiceDetails } from '../../lib/invoice.ts'
import type { SavedClient } from '../../lib/memorySave.ts'
import { findClient } from '../../lib/projectMemory.ts'
import { formatRand } from '../../lib/money.ts'
import type { InvoiceAction } from '../../lib/invoiceState.ts'
import { Toolbar } from '../Toolbar.tsx'
import './InvoiceTools.css'

// The tools: each one small enough to sit in the toolbar. Drag one down out of the toolbar and it becomes its own window, with
// every field there is to fill in.

type Dispatch = (action: InvoiceAction) => void

export function BusinessTool({ content, dispatch }: { content: InvoiceContent; dispatch: Dispatch }) {
  return (
    <Toolbar title="Your business">
      <label className="tool__field">
        <span className="visually-hidden">Your business name</span>
        <input
          className="tool__input"
          value={content.business.name}
          placeholder="Your business"
          maxLength={80}
          onChange={(event) => dispatch({ type: 'set_business', patch: { name: event.target.value } })}
          autoComplete="off"
        />
      </label>
    </Toolbar>
  )
}

// The client's name. A client the project remembers is offered as the name is typed, and when the field is left on one of their
// names, the rest of their details come with it, so a repeat client is picked and never retyped. This only fills in a client who
// has nothing else filled in yet, so it can never overwrite what was typed.
export function ClientTool({ content, remembered, dispatch }: { content: InvoiceContent; remembered: SavedClient[]; dispatch: Dispatch }) {
  const listId = useId()
  const { client } = content
  const hasOtherDetails = [client.contact, client.address, client.email, client.vatNumber, client.reference].some((value) => value.trim() !== '')
  return (
    <Toolbar title="Client">
      <label className="tool__field">
        <span className="visually-hidden">Client name</span>
        <input
          className="tool__input"
          value={client.name}
          placeholder="Client"
          maxLength={80}
          list={remembered.length > 0 ? listId : undefined}
          onChange={(event) => dispatch({ type: 'set_client', patch: { name: event.target.value } })}
          onBlur={() => {
            const match = findClient({ business: null, clients: remembered, invoices: [] }, client.name)
            if (match && !hasOtherDetails) dispatch({ type: 'set_client', patch: match.client })
          }}
          autoComplete="off"
        />
      </label>
      {remembered.length > 0 && (
        <datalist id={listId}>
          {remembered.map((saved) => (
            <option key={saved.id} value={saved.client.name} />
          ))}
        </datalist>
      )}
    </Toolbar>
  )
}

export function TermsTool({ details, dispatch }: { details: InvoiceDetails; dispatch: Dispatch }) {
  const due = dueDateOf(details)
  return (
    <Toolbar title="Terms">
      <label className="tool__select">
        <span className="visually-hidden">Payment is due</span>
        <select value={details.terms} onChange={(event) => dispatch({ type: 'set_details', patch: { terms: event.target.value as InvoiceDetails['terms'] } })}>
          {TERMS.map((terms) => (
            <option key={terms.id} value={terms.id}>
              {terms.label}
            </option>
          ))}
        </select>
      </label>
      <span className="tool__readout" title={due ? formatDate(due) : undefined}>
        {due ? `Due ${formatDate(due)}` : 'No date yet'}
      </span>
    </Toolbar>
  )
}

export function VatTool({ content, dispatch }: { content: InvoiceContent; dispatch: Dispatch }) {
  return (
    <Toolbar title="VAT">
      <button
        type="button"
        role="switch"
        aria-checked={content.vatRegistered}
        className="tool__switch"
        onClick={() => dispatch({ type: 'set_vat_registered', value: !content.vatRegistered })}
      >
        <span className="tool__track" aria-hidden="true">
          <span className="tool__thumb" />
        </span>
        <span>{content.vatRegistered ? 'Charging VAT' : 'No VAT'}</span>
      </button>
    </Toolbar>
  )
}

// A computed readout: the total, worked out in code from the lines.
export function TotalTool({ content }: { content: InvoiceContent }) {
  const totals = computeTotals(content.lines, content.vatRegistered)
  return (
    <Toolbar title="Total">
      <span className="tool__total">
        <span className="tool__total-label">{content.details.kind === 'quote' ? 'Total' : 'Total due'}</span>
        <output className="tool__total-amount">{formatRand(totals.totalCents)}</output>
      </span>
      {totals.unpriced > 0 && <span className="tool__readout">{totals.unpriced} without a price</span>}
    </Toolbar>
  )
}
