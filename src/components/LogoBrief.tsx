import type { BriefBlock } from '../compose/blocks.ts'
import { briefText, colourLine, logoSpec, type SpecColour } from '../lib/logoHandoff.ts'
import CopyText from './CopyText.tsx'
import SpecRows, { type SpecRowView } from './SpecRows.tsx'
import './LogoBrief.css'

type Props = {
  block: BriefBlock
  // The business name, from what the project holds. Empty if there is none yet.
  name: string
  // The colours of the saved palette, in code. The brief shows these and never a colour the model wrote.
  colours: SpecColour[]
  // The fonts the founder chose, in their words, if they have.
  fontsFact?: string
  // Droplet is working.
  busy?: boolean
  onOpenHandoff?: () => void
  // The palette is missing: opens the brand workspace.
  onOpenBrand?: () => void
}

// A brief for a logo made in another tool, in the chat. The words are Droplet's, written from what the founder said; the colours are the saved
// palette's and the files to ask for are the app's. Every line copies on its own, and Copy all takes the lot.
export default function LogoBrief({ block, name, colours, fontsFact, busy, onOpenHandoff, onOpenBrand }: Props) {
  const spec = logoSpec({ palette: { blocks: colours.map((colour) => ({ hex: colour.hex, role: colour.role })) }, fontsFact, proposedFonts: block.fonts })
  const words = { does: block.does, feel: block.feel, usedFor: block.usedFor }
  const rows: SpecRowView[] = [
    { id: 'does', label: 'What it does', value: block.does },
    { id: 'feel', label: 'The feel', value: block.feel.join(', ') },
    { id: 'used', label: 'Where it is used', value: block.usedFor },
    {
      id: 'colours',
      label: 'Colours',
      value: spec.colours.length === 0 ? 'No palette is saved yet.' : spec.colours.map(colourLine).join(', '),
      swatches: spec.colours.map((colour) => ({ hex: colour.hex, label: colourLine(colour) })),
    },
    { id: 'fonts', label: spec.fontsFrom === 'chosen' ? 'Fonts' : 'Fonts (suggested)', value: spec.fonts.join(' and ') },
  ]

  return (
    <section className="logo-brief" aria-label="Logo brief">
      <header className="logo-brief__header">
        <h3 className="logo-brief__title">Logo brief{name.trim() !== '' && ` for ${name.trim()}`}</h3>
        <CopyText text={briefText({ name, words, spec })} label="the whole brief">
          Copy all
        </CopyText>
      </header>
      <SpecRows rows={rows} label="Logo brief" />
      {spec.colours.length === 0 && (
        <p className="logo-brief__note">
          Your colours are not in the brief because no palette is saved.
          {onOpenBrand && (
            <>
              {' '}
              <button type="button" className="logo-brief__link" disabled={busy} onClick={onOpenBrand}>
                Build the brand first
              </button>
            </>
          )}
        </p>
      )}
      {onOpenHandoff && (
        <footer className="logo-brief__footer">
          <p className="logo-brief__note">Droplet does not make logos. The handoff card has the files to ask for and where to start.</p>
          <button type="button" className="logo-brief__open" onClick={onOpenHandoff}>
            Open the handoff card
          </button>
        </footer>
      )}
    </section>
  )
}
