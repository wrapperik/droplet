import type { Receipt } from '../compose/receipt.ts'
import './ChangeReceipt.css'

type Props = {
  receipt: Receipt
  // What can still be done with it. Only the reply that was just made can be undone or shown: after a reload the lines are all that is left.
  canUndo?: boolean
  canShow?: boolean
  // Droplet is working, so a button that would change the workspace waits.
  busy?: boolean
  onUndo?: () => void
  onShow?: () => void
}

// What a reply changed, under the reply: one line for each thing done, and one for each thing left out with the reason. It is built in code from what
// was applied, so it says what happened, not what Droplet said happened. Nothing here is marked by colour alone: a sign and a word say what was added or removed.
export default function ChangeReceipt({ receipt, canUndo = false, canShow = false, busy = false, onUndo, onShow }: Props) {
  const undoable = canUndo && !receipt.status
  return (
    <section className="receipt" aria-label={receipt.heading}>
      <h3 className="receipt__heading">{receipt.heading}</h3>
      {receipt.lines.length > 0 && (
        <ul className="receipt__lines">
          {receipt.lines.map((line, index) => (
            <li key={index} className="receipt__line" data-mark={line.mark || undefined}>
              <span className="receipt__mark" aria-hidden="true">
                {line.mark === '-' ? '−' : line.mark}
              </span>
              {line.mark === '+' && <span className="visually-hidden">Added: </span>}
              {line.mark === '-' && <span className="visually-hidden">Removed: </span>}
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
      )}
      {receipt.left.length > 0 && (
        <>
          <p className="receipt__subheading">Left out</p>
          <ul className="receipt__lines receipt__lines--left">
            {receipt.left.map((text, index) => (
              <li key={index} className="receipt__line">
                <span className="receipt__mark" aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {(undoable || canShow) && (
        <div className="receipt__actions">
          {undoable && (
            <button type="button" className="receipt__button" disabled={busy} onClick={onUndo}>
              Undo this
            </button>
          )}
          {canShow && (
            <button type="button" className="receipt__button" disabled={busy} onClick={onShow}>
              Show me
            </button>
          )}
        </div>
      )}
      {receipt.status && (
        <p className="receipt__status" role="status">
          {receipt.status}
        </p>
      )}
    </section>
  )
}
