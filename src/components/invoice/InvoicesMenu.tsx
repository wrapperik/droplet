import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AddCircleIcon, BillListIcon } from '@solar-icons/react/linear'
import { useDismiss } from '../../hooks/useDismiss.ts'
import { computeTotals, formatDate, todayIso, type InvoiceContent } from '../../lib/invoice.ts'
import type { SavedInvoice } from '../../lib/memorySave.ts'
import { isRevisedSinceExport } from '../../lib/projectMemory.ts'
import { formatRand } from '../../lib/money.ts'
import './InvoicesMenu.css'

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

type Props = {
  currentId: string
  current: InvoiceContent
  saved: SavedInvoice[]
  onOpen: (id: string) => void
  onNew: () => void
  onCopy: (id: string) => void
  onForget: (id: string) => void
}

// The Invoices menu, at the left of the header in both modes: every invoice the project remembers, with what it is for, what it comes to and where it
// stands. A founder can start a new one, open one to change it (it keeps its number), start another from it, or forget it. It is a popover, so nothing
// about the screen moves; opening, copying or starting one closes it (and the workspace asks first if there are changes nobody saved).
export default function InvoicesMenu({ currentId, current, saved, onOpen, onNew, onCopy, onForget }: Props) {
  const [open, setOpen] = useState(false)
  const [forgetting, setForgetting] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, wrapRef)
  const isSaved = saved.some((invoice) => invoice.id === currentId)
  const ordered = [...saved].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  // Going to another invoice closes the menu first, so a question about unsaved changes is not over the top of it.
  const then = (run: () => void) => () => {
    setOpen(false)
    run()
  }

  return (
    <div className="invoices-menu" ref={wrapRef}>
      <button type="button" className="workspace__button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <BillListIcon size={18} aria-hidden="true" />
        <span className="workspace__label">Invoices</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="invoices-menu__panel glass glass--strong"
            role="dialog"
            aria-label="Invoices"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="invoices">
              <button type="button" className="invoices__new" onClick={then(onNew)}>
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
                  const here = invoice.id === currentId
                  const content = here ? current : invoice.content
                  const total = computeTotals(content.lines, content.vatRegistered).totalCents
                  return (
                    <li key={invoice.id} className="invoices__item" data-open={here || undefined}>
                      <div>
                        <p className="invoices__name">
                          {labelOf(content)}
                          <span className="invoices__total">{formatRand(total)}</span>
                        </p>
                        <p className="invoices__note">
                          {here ? 'Open now. ' : ''}
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
                            {!here && (
                              <button type="button" className="invoices__action" onClick={then(() => onOpen(invoice.id))} aria-label={`Open ${labelOf(invoice.content)}`}>
                                Open
                              </button>
                            )}
                            <button type="button" className="invoices__action" onClick={then(() => onCopy(invoice.id))} aria-label={`Start a new invoice from ${labelOf(invoice.content)}`}>
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
              {saved.length === 0 && !isSaved && <p className="invoices__empty">Nothing is saved yet. Save this invoice and it will be here, with its number.</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
