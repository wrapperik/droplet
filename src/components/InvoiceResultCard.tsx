import { useEffect, useState } from 'react'
import { DownloadMinimalisticIcon, PenIcon } from '@solar-icons/react/linear'
import { starterBlocks } from '../compose/fallback.ts'
import { formatDate, type InvoiceContent } from '../lib/invoice.ts'
import type { InvoiceResult } from '../lib/invoiceGuide.ts'
import { loadMemory } from '../lib/memoryStore.ts'
import { formatRand } from '../lib/money.ts'
import { resolveRoles, type ResolvedRoles } from '../lib/palette.ts'
import { savedInvoice } from '../lib/projectMemory.ts'
import { loadPalette } from '../lib/projectStore.ts'
import { InvoicePaper } from './invoice/InvoiceDocument.tsx'
import './InvoiceResultCard.css'

export type ResultPreview = { content: InvoiceContent; roles: ResolvedRoles }

// The saved invoice and the brand, for the small page. Null when the invoice is not saved any more: the card then shows the words only.
async function readPreview(projectId: string, invoiceId: string): Promise<ResultPreview | null> {
  const [memory, palette] = await Promise.all([loadMemory(projectId), loadPalette(projectId)])
  const invoice = savedInvoice(memory, invoiceId)
  return invoice ? { content: invoice.content, roles: resolveRoles(palette?.blocks ?? starterBlocks()) } : null
}

type Props = {
  projectId: string
  result: InvoiceResult
  // Makes the PDF from what is saved, and says how it went in the app's own words.
  onExport?: () => Promise<{ ok: boolean; text: string }>
  // Opens the invoice again, to change it.
  onOpen?: () => void
  busy?: boolean
}

// A finished invoice, in the chat: the page as it will print, small, with its number, client, total and due date, and buttons to export it
// or open it again. What it shows of the page is read from what is saved, so it is what the PDF will be.
export default function InvoiceResultCard({ projectId, result, onExport, onOpen, busy }: Props) {
  const [preview, setPreview] = useState<ResultPreview | null>(null)
  const [status, setStatus] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let live = true
    void readPreview(projectId, result.invoiceId).then((found) => {
      if (live) setPreview(found)
    })
    return () => {
      live = false
    }
  }, [projectId, result.invoiceId])

  const title = `${result.title} ${result.number}`.trim()
  return (
    <section className="result" aria-label={title}>
      {preview && (
        <div className="result__page" aria-hidden="true">
          <InvoicePaper content={preview.content} roles={preview.roles} />
        </div>
      )}
      <div className="result__info">
        <h3 className="result__title">{title}</h3>
        {result.client && <p className="result__client">{result.client}</p>}
        <dl className="result__facts">
          <div>
            <dt>Total</dt>
            <dd>{formatRand(result.totalCents)}</dd>
          </div>
          {result.dueDate && (
            <div>
              <dt>Due</dt>
              <dd>{formatDate(result.dueDate)}</dd>
            </div>
          )}
        </dl>
        <div className="result__actions">
          {onExport && (
            <button
              type="button"
              className="result__button result__button--primary"
              disabled={exporting}
              onClick={async () => {
                setExporting(true)
                setStatus('')
                const outcome = await onExport()
                setExporting(false)
                setStatus(outcome.text)
              }}
            >
              <DownloadMinimalisticIcon size={16} aria-hidden="true" />
              {exporting ? 'Preparing' : 'Export PDF'}
            </button>
          )}
          {onOpen && (
            <button type="button" className="result__button" disabled={busy} onClick={onOpen}>
              <PenIcon size={16} aria-hidden="true" />
              Open
            </button>
          )}
        </div>
        <p className="result__status" role="status">
          {status}
        </p>
      </div>
    </section>
  )
}
