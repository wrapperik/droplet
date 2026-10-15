import type { CSSProperties } from 'react'
import { readableTextColour } from '../../lib/colour.ts'
import type { InvoiceContent } from '../../lib/invoice.ts'
import { invoiceView, logoSlotOf, type LogoSlot, type Text } from '../../lib/invoiceView.ts'
import type { ResolvedRoles } from '../../lib/palette.ts'
import { ReasonTip } from '../Toolbar.tsx'
import './InvoiceDocument.css'

type Props = {
  content: InvoiceContent
  // The brand the document is drawn in: the palette the founder confirmed, in its roles.
  roles: ResolvedRoles
  reason: string
  // The logo the founder brought back: undefined while it is being read (nothing is drawn for it), null if there is none (a placeholder and a note), or the logo.
  logo?: { dataUrl: string } | null
  // Opens the logo handoff card, from the note under the page. Without it the note says where to find it.
  onOpenHandoff?: () => void
}

const Part = ({ text }: { text: Text }) => (text.placeholder ? <span className="paper__placeholder">{text.text}</span> : <>{text.text}</>)

// The invoice as a page, in the founder's brand, laid out as it will print (A4, the PDF's own proportions: see the CSS). It is made from the same words as the PDF
// (`invoiceView`). A part that is not filled in yet shows a faded placeholder, so the page looks like an invoice from the first
// moment and says what is still to come. The colours are set as custom properties and used only inside the page.
export default function InvoiceDocument({ content, roles, reason, logo, onOpenHandoff }: Props) {
  return (
    <section className="paper-frame" aria-label="Invoice">
      <header className="paper-frame__header">
        <h2 className="paper-frame__title">Invoice</h2>
        <ReasonTip reason={reason} />
      </header>
      <InvoicePaper content={content} roles={roles} logo={logoSlotOf(logo)} />
      <p className="paper-note">Shown as it will print on A4.</p>
      {/* An outstanding logo flags the invoice and never blocks it: the business name is the brand until the logo is added, on the page and in the PDF. */}
      {logo === null && (
        <p className="paper-note paper-note--logo">
          Your logo is outstanding. The invoice uses your business name until you add it, and the dashed box is not printed.
          {onOpenHandoff && (
            <>
              {' '}
              <button type="button" className="paper-note__action" onClick={onOpenHandoff}>
                Add your logo
              </button>
            </>
          )}
        </p>
      )}
    </section>
  )
}

// The page alone, with no window round it, for a smaller copy such as the finished invoice in the chat. Its sizes are shares of the width of its
// container, so whatever holds it must be one (`container-type: inline-size`).
export function InvoicePaper({ content, roles, logo }: Pick<Props, 'content' | 'roles'> & { logo?: LogoSlot | null }) {
  const view = invoiceView(content, logo ?? null)
  const colours = {
    '--paper-background': roles.background.hex,
    '--paper-text': roles.text.hex,
    '--paper-primary': roles.primary.hex,
    '--paper-on-primary': readableTextColour(roles.primary.hex),
    '--paper-accent': roles.accent.hex,
  } as CSSProperties

  return (
    <article className="paper" style={colours} aria-label={`${view.title} ${view.number.text}`}>
      <header className="paper__band">
        <span className="paper__brand">
          {view.logo?.kind === 'added' && (
            <span className="paper__logo">
              <img src={view.logo.src} alt={view.logo.alt} />
            </span>
          )}
          {view.logo?.kind === 'outstanding' && (
            <span className="paper__logo paper__logo--outstanding" aria-label="Logo outstanding">
              Logo
            </span>
          )}
          <span className="paper__business">
            <Part text={view.from[0]} />
          </span>
        </span>
        <span className="paper__kind">{view.title}</span>
      </header>

      <div className="paper__body">
        <dl className="paper__meta">
          <div>
            <dt>Number</dt>
            <dd>
              <Part text={view.number} />
            </dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>
              <Part text={view.issued} />
            </dd>
          </div>
          <div>
            <dt>{view.dueLabel}</dt>
            <dd>
              <Part text={view.due} />
            </dd>
          </div>
          {view.reference && (
            <div>
              <dt>Reference</dt>
              <dd>{view.reference}</dd>
            </div>
          )}
        </dl>

        <div className="paper__parties">
          <div>
            <h3 className="paper__label">From</h3>
            <p className="paper__address">
              {view.from.slice(1).map((part, index) => (
                <span key={index}>
                  <Part text={part} />
                </span>
              ))}
            </p>
          </div>
          <div>
            <h3 className="paper__label">Billed to</h3>
            <p className="paper__address">
              {view.to.map((part, index) => (
                <span key={index} className={index === 0 ? 'paper__strong' : undefined}>
                  <Part text={part} />
                </span>
              ))}
            </p>
          </div>
        </div>

        <table className="paper__table">
          <thead>
            <tr>
              <th scope="col">Description</th>
              <th scope="col">Qty</th>
              <th scope="col">Price</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {view.lines.map((line, index) => (
              <tr key={index} data-incomplete={line.incomplete || undefined}>
                <td>
                  <Part text={line.description} />
                </td>
                <td>{line.quantity}</td>
                <td>
                  <Part text={line.unit} />
                </td>
                <td>
                  <Part text={line.amount} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="paper__totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{view.subtotal}</dd>
          </div>
          {view.vat && (
            <div>
              <dt>{view.vat.label}</dt>
              <dd>{view.vat.amount}</dd>
            </div>
          )}
        </dl>

        <div className="paper__total">
          <span>{view.totalLabel}</span>
          <span>{view.total}</span>
        </div>

        {view.payment && (
          <p className="paper__payment">
            {view.payment.map((part, index) => (
              <span key={index} className={index === 0 ? 'paper__strong' : undefined}>
                {part}
              </span>
            ))}
          </p>
        )}
        {view.notes && <p className="paper__notes">{view.notes}</p>}
      </div>
    </article>
  )
}
