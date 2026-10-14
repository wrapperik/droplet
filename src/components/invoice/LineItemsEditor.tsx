import { useId, useState } from 'react'
import { AddCircleIcon, AltArrowDownIcon, AltArrowUpIcon, StarIcon, TrashBinMinimalisticIcon } from '@solar-icons/react/linear'
import { computeTotals, lineIsBlank, lineProblems, quantityIsValid, type Line, type LineProblem } from '../../lib/invoice.ts'
import { centsToField, formatRand, parseMoney } from '../../lib/money.ts'
import type { InvoiceAction } from '../../lib/invoiceState.ts'
import { lineSuggestions } from '../../lib/inlineAi.ts'
import AskDroplet from '../AskDroplet.tsx'
import ToolWindow from '../ToolWindow.tsx'
import './LineItemsEditor.css'

type Props = {
  lines: Line[]
  vatRegistered: boolean
  dispatch: (action: InvoiceAction) => void
  reason: string
}

const LABELS: Record<LineProblem, string> = { description: 'a description', quantity: 'a quantity', price: 'a price' }

type RowProps = { line: Line; index: number; count: number; problems: LineProblem[]; amount: number | null; dispatch: (action: InvoiceAction) => void }

// One line. The quantity and the price are typed as text and read when they make sense, so half-typed numbers are never lost
// or rewritten under the cursor. When the field is left, it shows the number as it was understood.
function Row({ line, index, count, problems, amount, dispatch }: RowProps) {
  const [quantityDraft, setQuantityDraft] = useState<string | null>(null)
  const [priceDraft, setPriceDraft] = useState<string | null>(null)
  const [syncedQuantity, setSyncedQuantity] = useState(line.quantity)
  const [syncedPrice, setSyncedPrice] = useState(line.unitCents)

  // When the line is changed from elsewhere (an undo, the AI), show it, whatever was half typed.
  if (line.quantity !== syncedQuantity) {
    setSyncedQuantity(line.quantity)
    setQuantityDraft(null)
  }
  if (line.unitCents !== syncedPrice) {
    setSyncedPrice(line.unitCents)
    setPriceDraft(null)
  }

  const patch = (change: Partial<Omit<Line, 'id'>>) => dispatch({ type: 'update_line', id: line.id, patch: change })

  const quantityText = quantityDraft ?? String(line.quantity)
  const quantityInvalid = quantityDraft !== null && !quantityIsValid(Number(quantityDraft.replace(',', '.')))
  const priceText = priceDraft ?? (line.unitCents === null ? '' : centsToField(line.unitCents))
  const priceInvalid = priceDraft !== null && priceDraft.trim() !== '' && parseMoney(priceDraft) === null

  // A begun line that is missing something is marked, so it is seen before it matters. A blank line is left alone.
  const begun = !lineIsBlank(line)
  const missing = (problem: LineProblem) => begun && problems.includes(problem)

  return (
    <li className="lines__row" data-line-id={line.id} aria-label={`Line ${index + 1}`}>
      <label className="lines__cell lines__cell--description">
        <span className="visually-hidden">Description</span>
        <input
          className="lines__input"
          value={line.description}
          placeholder="Description"
          maxLength={200}
          aria-invalid={missing('description') || undefined}
          onChange={(event) => patch({ description: event.target.value })}
        />
      </label>
      <label className="lines__cell lines__cell--quantity">
        <span className="visually-hidden">Quantity</span>
        <input
          className="lines__input lines__input--number"
          inputMode="decimal"
          value={quantityText}
          aria-invalid={quantityInvalid || missing('quantity') || undefined}
          onChange={(event) => {
            const text = event.target.value
            setQuantityDraft(text)
            const number = Number(text.replace(',', '.'))
            if (text.trim() !== '' && quantityIsValid(number)) {
              // This edit is the field's own, so it is marked as seen and the half-typed text is kept.
              setSyncedQuantity(number)
              patch({ quantity: number })
            }
          }}
          onBlur={() => setQuantityDraft(null)}
        />
      </label>
      <label className="lines__cell lines__cell--price">
        <span className="visually-hidden">Price each, in rand</span>
        <input
          className="lines__input lines__input--number"
          inputMode="decimal"
          value={priceText}
          placeholder="0.00"
          aria-invalid={priceInvalid || missing('price') || undefined}
          onChange={(event) => {
            const text = event.target.value
            setPriceDraft(text)
            const cents = text.trim() === '' ? null : parseMoney(text)
            if (text.trim() === '' || cents !== null) {
              // This edit is the field's own, so it is marked as seen and the half-typed text is kept.
              setSyncedPrice(cents)
              patch({ unitCents: cents })
            }
          }}
          onBlur={() => setPriceDraft(null)}
        />
      </label>
      <output className="lines__amount" aria-label={`Amount for line ${index + 1}`}>
        {amount === null ? '–' : formatRand(amount)}
      </output>
      <div className="lines__actions">
        <AskDroplet compact suggestions={line.description.trim() === '' ? [] : lineSuggestions(index + 1, line.description)} label={`Ask Droplet about line ${index + 1}`} />
        <button type="button" className="lines__icon" aria-pressed={Boolean(line.starred)} onClick={() => dispatch({ type: 'update_line', id: line.id, patch: { starred: !line.starred } })} aria-label={`Keep line ${index + 1} in mind`}>
          <StarIcon size={16} aria-hidden="true" />
        </button>
        <button type="button" className="lines__icon" disabled={index === 0} onClick={() => dispatch({ type: 'move_line', id: line.id, direction: 'up' })} aria-label={`Move line ${index + 1} up`}>
          <AltArrowUpIcon size={16} aria-hidden="true" />
        </button>
        <button type="button" className="lines__icon" disabled={index === count - 1} onClick={() => dispatch({ type: 'move_line', id: line.id, direction: 'down' })} aria-label={`Move line ${index + 1} down`}>
          <AltArrowDownIcon size={16} aria-hidden="true" />
        </button>
        <button type="button" className="lines__icon" onClick={() => dispatch({ type: 'remove_line', id: line.id })} aria-label={`Remove line ${index + 1}`}>
          <TrashBinMinimalisticIcon size={16} aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

// The line item editor: a row for each thing being charged for, with the amount worked out in code. A line that is begun and
// still missing something is marked and named underneath, and a line with no price is counted as nothing until it has one.
export default function LineItemsEditor({ lines, vatRegistered, dispatch, reason }: Props) {
  const totals = computeTotals(lines, vatRegistered)
  const hintId = useId()
  const flagged = lines
    .map((line, index) => ({ index, problems: lineIsBlank(line) ? [] : lineProblems(line) }))
    .filter((entry) => entry.problems.length > 0)

  return (
    <ToolWindow title="Line items" reason={reason}>
      <div className="lines__head" aria-hidden="true">
        <span>Description</span>
        <span>Qty</span>
        <span>Price</span>
        <span>Amount</span>
      </div>
      <ol className="lines" aria-describedby={flagged.length > 0 ? hintId : undefined}>
        {lines.map((line, index) => (
          <Row
            key={line.id}
            line={line}
            index={index}
            count={lines.length}
            problems={lineProblems(line)}
            amount={totals.amounts[line.id] ?? null}
            dispatch={dispatch}
          />
        ))}
      </ol>
      <button type="button" className="lines__add" onClick={() => dispatch({ type: 'add_line' })}>
        <AddCircleIcon size={18} aria-hidden="true" />
        Add a line
      </button>
      {flagged.length > 0 && (
        <ul className="lines__hint" id={hintId}>
          {flagged.map(({ index, problems }) => (
            <li key={index}>
              Line {index + 1} needs {problems.map((problem) => LABELS[problem]).join(' and ')}.
              {problems.includes('price') && ' It is not counted in the total until it has a price.'}
            </li>
          ))}
        </ul>
      )}
    </ToolWindow>
  )
}
