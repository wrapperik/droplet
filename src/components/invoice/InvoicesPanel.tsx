import { useState } from 'react'
import { AddCircleIcon } from '@solar-icons/react/linear'
import { computeTotals, formatDate, todayIso, type InvoiceContent } from '../../lib/invoice.ts'
import type { SavedInvoice } from '../../lib/memorySave.ts'
import { isRevisedSinceExport } from '../../lib/projectMemory.ts'
import { formatRand } from '../../lib/money.ts'
import ToolWindow from '../ToolWindow.tsx'
import './InvoicesPanel.css'

// What an invoice is called in a list: its number and who it is for.
const labelOf = (content: InvoiceContent) => {
  const client = content.client.name.trim()
  return `${content.details.number.trim() || 'No number'}${client ? ` · ${client}` : ''}`
}

function statusOf(invoice: SavedInvoice): string {
  if (invoice.exportedAt === undefined) return 'Not exported yet'
  const day = formatDate(todayIso(new Date(invoice.exportedAt)))
  return isRevisedSinceExport(invoice) ? `Changed since it was exported on ${day}` : `Exported on ${day}`
}

type WindowProps = {
  currentId: string
  current: InvoiceContent
  saved: SavedInvoice[]
  onOpen: (id: string) => void
  onNew: () => void
  onCopy: (id: string) => void
  onForget: (id: string) => void
  reason: string
}

// The window: every invoice the project remembers, with what it is for, what it comes to and where it stands. A founder can open
// one to change it (it keeps its number), start another from it, or forget it.
export function InvoicesWindow({ currentId, current, saved, onOpen, onNew, onCopy, onForget, reason }: WindowProps) {
  const [forgetting, setForgetting] = useState<string | null>(null)
  const isSaved = saved.some((invoice) => invoice.id === currentId)
  const ordered = [...saved].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <ToolWindow title="Invoices" reason={reason}>
      <div className="invoices">
        <button type="button" className="invoices__new" onClick={onNew}>
          <AddCircleIcon size={18} aria-hidden="true" />
          New invoice
        </button>
        <ul className="invoices__list">
          {!isSaved && (
            <li className="invoices__item" data-open="">
              <div>
                <p className="invoices__name">{labelOf(current)}</p>
                <p className="invoices__note">Open now. Not saved yet.</p>
              </div>
            </li>
          )}
          {ordered.map((invoice) => {
            const open = invoice.id === currentId
            const content = open ? current : invoice.content
            const total = computeTotals(content.lines, content.vatRegistered).totalCents
            return (
              <li key={invoice.id} className="invoices__item" data-open={open || undefined}>
                <div>
                  <p className="invoices__name">
                    {labelOf(content)}
                    <span className="invoices__total">{formatRand(total)}</span>
                  </p>
                  <p className="invoices__note">
                    {open ? 'Open now. ' : ''}
                    {statusOf(invoice)}. {invoice.revision > 1 ? `Saved ${invoice.revision} times.` : 'Saved once.'}
                  </p>
                </div>
                <div className="invoices__actions">
                  {forgetting === invoice.id ? (
                    <>
                      <span className="invoices__ask">Forget it?</span>
                      <button type="button" className="invoices__action invoices__action--danger" onClick={() => { onForget(invoice.id); setForgetting(null) }}>
                        Forget
                      </button>
                      <button type="button" className="invoices__action" onClick={() => setForgetting(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <>
                      {!open && (
                        <button type="button" className="invoices__action" onClick={() => onOpen(invoice.id)} aria-label={`Open ${labelOf(invoice.content)}`}>
                          Open
                        </button>
                      )}
                      <button type="button" className="invoices__action" onClick={() => onCopy(invoice.id)} aria-label={`Start a new invoice from ${labelOf(invoice.content)}`}>
                        Copy
                      </button>
                      <button type="button" className="invoices__action" onClick={() => setForgetting(invoice.id)} aria-label={`Forget ${labelOf(invoice.content)}`}>
                        Forget
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        {saved.length === 0 && isSaved === false && <p className="invoices__empty">Nothing is saved yet. Save this invoice and it will be here, with its number.</p>}
      </div>
    </ToolWindow>
  )
}
