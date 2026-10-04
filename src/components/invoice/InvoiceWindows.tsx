import { useId, useState } from 'react'
import { TERMS, computeTotals, dueDateOf, formatDate, type Business, type Client, type InvoiceContent, type InvoiceDetails } from '../../lib/invoice.ts'
import { VAT_RATE_BP, formatRand, percentLabel } from '../../lib/money.ts'
import { quantityText } from '../../lib/invoiceView.ts'
import type { SavedClient } from '../../lib/memorySave.ts'
import type { MemoryStatus } from '../../lib/projectMemory.ts'
import type { InvoiceAction } from '../../lib/invoiceState.ts'
import ToolWindow from '../ToolWindow.tsx'
import './InvoiceWindows.css'

// The windows the tools become when they are dragged out of the toolbar. Each is a form for one part of the invoice, and every
// field changes the document at once.

type Dispatch = (action: InvoiceAction) => void

type TextFieldProps = { label: string; value: string; onChange: (value: string) => void; hint?: string; maxLength?: number; type?: string; multiline?: boolean; placeholder?: string }

// A text field whose label is its own, so a screen reader reads it and a click on the label focuses it.
function TextField({ label, value, onChange, hint, maxLength = 120, type = 'text', multiline, placeholder }: TextFieldProps) {
  const id = useId()
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea id={id} className="field__input field__input--area" rows={3} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input id={id} className="field__input" type={type} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} autoComplete="off" />
      )}
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  )
}

// What the project remembers about a thing, in a sentence, so a founder always knows whether it will be there next time.
function Remembered({ what, status, onForget }: { what: string; status: MemoryStatus; onForget?: () => void }) {
  const [asking, setAsking] = useState(false)
  if (status === 'none') return <p className="fields__note">{`Fill in the name, and you can save ${what} for next time.`}</p>
  const text =
    status === 'new' ? `Not remembered yet. Save, and tick it, to have ${what} ready next time.` : status === 'updated' ? `Changed since it was remembered. Save to replace what is remembered.` : `Remembered, so it is ready on the next invoice.`
  return (
    <div className="remembered">
      <p className="fields__note">{text}</p>
      {onForget && status !== 'new' && (asking ? (
        <span className="remembered__ask">
          <span>Forget it?</span>
          <button type="button" className="remembered__button remembered__button--danger" onClick={() => { onForget(); setAsking(false) }}>
            Forget
          </button>
          <button type="button" className="remembered__button" onClick={() => setAsking(false)}>
            Keep
          </button>
        </span>
      ) : (
        <button type="button" className="remembered__button" onClick={() => setAsking(true)}>
          Forget
        </button>
      ))}
    </div>
  )
}

// Your business: entered once, and on every invoice after it.
export function BusinessWindow({ business, status, onForget, dispatch, reason }: { business: Business; status: MemoryStatus; onForget: () => void; dispatch: Dispatch; reason: string }) {
  const set = (patch: Partial<Business>) => dispatch({ type: 'set_business', patch })
  return (
    <ToolWindow title="Your business" reason={reason}>
      <div className="fields">
        <TextField label="Business name" value={business.name} maxLength={80} onChange={(name) => set({ name })} />
        <TextField label="Address" value={business.address} maxLength={300} multiline onChange={(address) => set({ address })} />
        <div className="fields__pair">
          <TextField label="Email" type="email" value={business.email} onChange={(email) => set({ email })} />
          <TextField label="Phone" type="tel" value={business.phone} maxLength={40} onChange={(phone) => set({ phone })} />
        </div>
        <TextField label="VAT number" value={business.vatNumber} maxLength={30} hint="Only if you are registered for VAT." onChange={(vatNumber) => set({ vatNumber })} />
        <h3 className="fields__group">How you get paid</h3>
        <TextField label="Account holder" value={business.accountHolder} maxLength={80} onChange={(accountHolder) => set({ accountHolder })} />
        <div className="fields__pair">
          <TextField label="Bank" value={business.bankName} maxLength={60} onChange={(bankName) => set({ bankName })} />
          <TextField label="Branch code" value={business.branchCode} maxLength={20} onChange={(branchCode) => set({ branchCode })} />
        </div>
        <TextField label="Account number" value={business.accountNumber} maxLength={30} onChange={(accountNumber) => set({ accountNumber })} />
      </div>
      <Remembered what="your business details" status={status} onForget={onForget} />
      <p className="fields__note">Kept on this device only.</p>
    </ToolWindow>
  )
}

type ClientWindowProps = {
  client: Client
  status: MemoryStatus
  // The clients the project remembers, to pick from.
  remembered: SavedClient[]
  onForget: (id: string) => void
  dispatch: Dispatch
  reason: string
}

// The client the invoice is for, and the clients the project remembers.
export function ClientWindow({ client, status, remembered, onForget, dispatch, reason }: ClientWindowProps) {
  const set = (patch: Partial<Client>) => dispatch({ type: 'set_client', patch })
  const [forgetting, setForgetting] = useState<string | null>(null)
  const savedHere = remembered.find((saved) => saved.client.name.trim().toLowerCase() === client.name.trim().toLowerCase())
  return (
    <ToolWindow title="Client" reason={reason}>
      {remembered.length > 0 && (
        <div className="clients">
          <h3 className="fields__group clients__heading">Clients you have saved</h3>
          <ul className="clients__list">
            {remembered.map((saved) => (
              <li key={saved.id} className="clients__item">
                <span className="clients__name">{saved.client.name}</span>
                {forgetting === saved.id ? (
                  <span className="remembered__ask">
                    <span>Forget?</span>
                    <button type="button" className="remembered__button remembered__button--danger" onClick={() => { onForget(saved.id); setForgetting(null) }}>
                      Forget
                    </button>
                    <button type="button" className="remembered__button" onClick={() => setForgetting(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <span className="clients__actions">
                    <button type="button" className="remembered__button" onClick={() => set(saved.client)} aria-label={`Use ${saved.client.name}`}>
                      Use
                    </button>
                    <button type="button" className="remembered__button" onClick={() => setForgetting(saved.id)} aria-label={`Forget ${saved.client.name}`}>
                      Forget
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="fields">
        <TextField label="Client or company name" value={client.name} maxLength={80} onChange={(name) => set({ name })} />
        <TextField label="Contact person" value={client.contact} maxLength={80} onChange={(contact) => set({ contact })} />
        <TextField label="Address" value={client.address} maxLength={300} multiline onChange={(address) => set({ address })} />
        <TextField label="Email" type="email" value={client.email} onChange={(email) => set({ email })} />
        <div className="fields__pair">
          <TextField label="Their VAT number" value={client.vatNumber} maxLength={30} onChange={(vatNumber) => set({ vatNumber })} />
          <TextField label="Their reference" value={client.reference} maxLength={60} hint="Such as a purchase order number." onChange={(reference) => set({ reference })} />
        </div>
      </div>
      <Remembered what="this client" status={status} onForget={savedHere ? () => onForget(savedHere.id) : undefined} />
    </ToolWindow>
  )
}

// The invoice itself: its number, its dates, when it is due, and a note.
export function DetailsWindow({ details, dispatch, reason }: { details: InvoiceDetails; dispatch: Dispatch; reason: string }) {
  const set = (patch: Partial<InvoiceDetails>) => dispatch({ type: 'set_details', patch })
  const due = dueDateOf(details)
  const termsId = useId()
  return (
    <ToolWindow title="Invoice details" reason={reason}>
      <div className="fields">
        <TextField label="Invoice number" value={details.number} maxLength={40} hint="It stays the same if you change the invoice and send it again." onChange={(number) => set({ number })} />
        <TextField label="Date" type="date" value={details.issueDate} maxLength={10} onChange={(issueDate) => set({ issueDate })} />
        <div className="field">
          <label className="field__label" htmlFor={termsId}>
            Payment is due
          </label>
          <select id={termsId} className="field__input" value={details.terms} onChange={(event) => set({ terms: event.target.value as InvoiceDetails['terms'] })}>
            {TERMS.map((terms) => (
              <option key={terms.id} value={terms.id}>
                {terms.label}
              </option>
            ))}
          </select>
          <span className="field__hint">{due ? `That is ${formatDate(due)}.` : 'Choose a date below.'}</span>
        </div>
        {details.terms === 'custom' && <TextField label="Due date" type="date" value={details.customDueDate} maxLength={10} onChange={(customDueDate) => set({ customDueDate })} />}
        <TextField label="Note" value={details.notes} maxLength={1000} multiline placeholder="Thank you, or what the payment is for." onChange={(notes) => set({ notes })} />
      </div>
    </ToolWindow>
  )
}

// VAT: whether the business charges it, and what that changes on the page.
export function VatWindow({ content, dispatch, reason }: { content: InvoiceContent; dispatch: Dispatch; reason: string }) {
  const { vatRegistered, business } = content
  const id = useId()
  return (
    <ToolWindow title="VAT" reason={reason}>
      <div className="vat">
        <label className="vat__switch" htmlFor={id}>
          <input id={id} type="checkbox" role="switch" checked={vatRegistered} onChange={(event) => dispatch({ type: 'set_vat_registered', value: event.target.checked })} />
          <span>I am registered for VAT</span>
        </label>
        <p className="vat__effect">
          {vatRegistered
            ? `The document is a tax invoice. It charges ${percentLabel(VAT_RATE_BP)} VAT on the subtotal and shows your VAT number.`
            : 'The document is a plain invoice with no VAT. Turn this on only if SARS has given you a VAT number.'}
        </p>
        {vatRegistered && <TextField label="Your VAT number" value={business.vatNumber} maxLength={30} onChange={(vatNumber) => dispatch({ type: 'set_business', patch: { vatNumber } })} />}
      </div>
    </ToolWindow>
  )
}

// The totals, with the working shown, so the number is something to check and not only something to trust.
export function TotalsWindow({ content, reason }: { content: InvoiceContent; reason: string }) {
  const totals = computeTotals(content.lines, content.vatRegistered)
  const counted = content.lines.filter((line) => totals.amounts[line.id] !== null && totals.amounts[line.id] !== undefined)
  return (
    <ToolWindow title="Totals" reason={reason}>
      <div className="totals">
        {counted.length === 0 ? (
          <p className="totals__empty">Nothing is counted yet. A line needs a quantity and a price.</p>
        ) : (
          <ul className="totals__working">
            {counted.map((line) => (
              <li key={line.id}>
                <span>{line.description.trim() || 'No description'}</span>
                <span>
                  {quantityText(line.quantity)} × {formatRand(line.unitCents!)}
                </span>
                <span>{formatRand(totals.amounts[line.id]!)}</span>
              </li>
            ))}
          </ul>
        )}
        <dl className="totals__sums">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatRand(totals.subtotalCents)}</dd>
          </div>
          {totals.vatCents !== null && (
            <div>
              <dt>VAT ({percentLabel(VAT_RATE_BP)})</dt>
              <dd>{formatRand(totals.vatCents)}</dd>
            </div>
          )}
          <div className="totals__total">
            <dt>{content.details.kind === 'quote' ? 'Total' : 'Total due'}</dt>
            <dd>{formatRand(totals.totalCents)}</dd>
          </div>
        </dl>
        {totals.unpriced > 0 && (
          <p className="totals__warning">
            {totals.unpriced === 1 ? '1 line is' : `${totals.unpriced} lines are`} not counted because {totals.unpriced === 1 ? 'it has' : 'they have'} no price or quantity yet.
          </p>
        )}
      </div>
    </ToolWindow>
  )
}
