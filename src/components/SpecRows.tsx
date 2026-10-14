import CopyText from './CopyText.tsx'
import './SpecRows.css'

export type SpecRowView = {
  id: string
  label: string
  value: string
  // Colours to draw as swatches beside the words, each with its hex code.
  swatches?: { hex: string; label: string }[]
}

// A list of things to copy, one per row, with the label on the left and a copy button on the right. Used by the logo brief in the chat and the
// handoff card's spec panel, so both look and behave the same.
export default function SpecRows({ rows, label }: { rows: SpecRowView[]; label: string }) {
  return (
    <dl className="spec-rows" aria-label={label}>
      {rows.map((row) => (
        <div key={row.id} className="spec-rows__row">
          <dt className="spec-rows__label">{row.label}</dt>
          <dd className="spec-rows__value">
            {row.swatches && row.swatches.length > 0 && (
              <ul className="spec-rows__swatches" role="list">
                {row.swatches.map((swatch) => (
                  <li key={swatch.hex} className="spec-rows__swatch">
                    <span className="spec-rows__chip" style={{ background: swatch.hex }} aria-hidden="true" />
                    <span>{swatch.label}</span>
                  </li>
                ))}
              </ul>
            )}
            {!(row.swatches && row.swatches.length > 0) && <span>{row.value}</span>}
          </dd>
          <CopyText text={row.value} label={row.label.toLowerCase()} />
        </div>
      ))}
    </dl>
  )
}
