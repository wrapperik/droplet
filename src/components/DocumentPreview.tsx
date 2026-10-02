import type { CSSProperties } from 'react'
import { readableTextColour } from '../lib/colour.ts'
import { pairResult, type ResolvedRoles } from '../lib/palette.ts'
import {
  SAMPLE_BUSINESS,
  SAMPLE_CLIENT,
  SAMPLE_LINES,
  SAMPLE_VAT_RATE,
  formatRand,
  invoiceTotals,
} from '../lib/sampleInvoice.ts'
import ContrastBadge from './ContrastBadge.tsx'
import { ReasonTip } from './Toolbar.tsx'
import './DocumentPreview.css'

type Props = {
  roles: ResolvedRoles
  // One line saying why this component is on screen (manifesto principle 3).
  reason: string
}

const VAT_PERCENT = Math.round(SAMPLE_VAT_RATE * 100)

// The palette on a real document: a sample invoice drawn with the colours in their roles. The document's own
// colours are the founder's palette, so they are set here as custom properties and used only inside the page.
export default function DocumentPreview({ roles, reason }: Props) {
  const totals = invoiceTotals(SAMPLE_LINES, SAMPLE_VAT_RATE)
  const body = pairResult(roles.text.hex, roles.background.hex)

  const colours = {
    '--doc-background': roles.background.hex,
    '--doc-text': roles.text.hex,
    '--doc-primary': roles.primary.hex,
    '--doc-on-primary': readableTextColour(roles.primary.hex),
    '--doc-accent': roles.accent.hex,
    '--doc-on-accent': readableTextColour(roles.accent.hex),
  } as CSSProperties

  return (
    <section className="preview" aria-label="Document preview">
      <header className="preview__header">
        <h2 className="preview__title">Preview</h2>
        <ReasonTip reason={reason} />
        <p className="preview__note">A sample invoice. The names and amounts are made up.</p>
      </header>

      <div className="doc" style={colours}>
        <div className="doc__band">
          <span className="doc__business">{SAMPLE_BUSINESS}</span>
          <span className="doc__kind">Invoice 0001</span>
        </div>

        <div className="doc__body">
          <div className="doc__meta">
            <div>
              <span className="doc__label">Billed to</span>
              <span className="doc__value">{SAMPLE_CLIENT}</span>
            </div>
            <div>
              <span className="doc__label">Due</span>
              <span className="doc__value">16 October 2026</span>
            </div>
          </div>

          <table className="doc__table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Qty</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {totals.lines.map((line) => (
                <tr key={line.description}>
                  <td>{line.description}</td>
                  <td>{line.quantity}</td>
                  <td>{formatRand(line.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="doc__totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatRand(totals.subtotalCents)}</dd>
            </div>
            <div>
              <dt>VAT ({VAT_PERCENT}%)</dt>
              <dd>{formatRand(totals.vatCents)}</dd>
            </div>
          </dl>

          <div className="doc__total">
            <span>Total due</span>
            <span>{formatRand(totals.totalCents)}</span>
          </div>
        </div>
      </div>

      <p className="preview__verdict">
        <span className="preview__verdict-label">Text on background</span>
        <ContrastBadge ratio={body.ratio} level={body.level} />
      </p>
      {body.level === 'fail' && (
        <p className="preview__warning">
          The text on this page is hard to read. Choose a different Text or Background colour.
        </p>
      )}
    </section>
  )
}
