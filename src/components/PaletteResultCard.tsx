import { useState } from 'react'
import { DownloadMinimalisticIcon, PenIcon } from '@solar-icons/react/linear'
import type { PaletteResult } from '../lib/brandGuide.ts'
import { COLOUR_ROLES } from '../lib/palette.ts'
import ContrastBadge from './ContrastBadge.tsx'
import './InvoiceResultCard.css'
import './PaletteResultCard.css'

type Props = {
  result: PaletteResult
  // Makes the brand sheet from what is saved, and says how it went in the app's own words.
  onExport?: () => Promise<{ ok: boolean; text: string }>
  // Opens the brand workspace again, to change the palette.
  onOpen?: () => void
  busy?: boolean
}

const ROLE_LABEL = Object.fromEntries(COLOUR_ROLES.map((role) => [role.id, role.label]))

// A finished palette, in the chat: the colours with their roles, how the text reads on the background, and buttons to export the brand sheet or open the workspace
// again. The colours are the ones that were saved when the founder finished; the export reads what is saved.
export default function PaletteResultCard({ result, onExport, onOpen, busy }: Props) {
  const [status, setStatus] = useState('')
  const [exporting, setExporting] = useState(false)

  return (
    <section className="result result--palette" aria-label={result.title}>
      <div className="result__info">
        <h3 className="result__title">{result.title}</h3>
        <ul className="result__swatches">
          {result.colours.map((colour, index) => (
            <li key={`${index}:${colour.hex}`} className="result__swatch">
              <span className="result__chip" style={{ background: colour.hex }} aria-hidden="true" />
              <span className="result__swatch-text">
                <span className="result__swatch-role">{colour.role ? ROLE_LABEL[colour.role] : 'Colour'}</span>
                <span className="result__swatch-hex">{colour.hex}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="result__readable">
          <span>Text on background</span>
          <ContrastBadge ratio={result.ratio} level={result.level} />
        </p>
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
              {exporting ? 'Preparing' : 'Export brand sheet'}
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
