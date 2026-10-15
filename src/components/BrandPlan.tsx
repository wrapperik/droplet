import { CloseIcon, CheckIcon } from '@solar-icons/react/linear'
import { fontPairById, voiceSentence } from '../lib/brandType.ts'
import { COLOUR_ROLES, pairResult, type PaletteBlock, type ResolvedRoles } from '../lib/palette.ts'
import StatusMark from './StatusMark.tsx'
import './BrandSteps.css'

type Props = {
  blocks: PaletteBlock[]
  roles: ResolvedRoles
  fonts: string | null
  voice: string[]
  businessName: string
  // Whether the project has a logo yet. The logo is made outside Droplet, so it is shown as to do until a file is brought back.
  hasLogo: boolean
}

const roleLabel = (id: string | undefined) => COLOUR_ROLES.find((role) => role.id === id)?.label

// Step four of the brand guide: everything decided, on one page, in the founder's own colours and typefaces. Nothing here is new: it is the palette, the roles, the
// pair, the voice and how the text reads, worked out in code, plus what is still to do. Finish saves it, and Download makes the same page as a PDF.
export default function BrandPlan({ blocks, roles, fonts, voice, businessName, hasLogo }: Props) {
  const pair = fontPairById(fonts)
  const key = pairResult(roles.text.hex, roles.background.hex)
  const passes = key.level !== 'fail'
  return (
    <section className="bstep bplan" data-part="plan" tabIndex={-1} aria-label="Brand plan">
      <h3 className="bstep__title">Brand plan</h3>
      <p className="bstep__lead">Everything you decided for {businessName}, on one page. Finish saves it. Download makes it a PDF you can keep.</p>

      <div className="bplan__page" style={{ background: roles.background.hex, color: roles.text.hex }}>
        <h4 className="bplan__name" style={{ fontFamily: pair?.headingStack }}>
          {businessName}
        </h4>

        <div className="bplan__section">
          <h5 className="bplan__label">Colours</h5>
          <ul className="bplan__swatches">
            {blocks.map((block, index) => (
              <li key={block.id} className="bplan__swatch">
                <span className="bplan__chip" style={{ background: block.hex }} aria-hidden="true" />
                <span className="bplan__hex">{block.hex}</span>
                <span className="bplan__role">{roleLabel(block.role) ?? `Colour ${index + 1}`}</span>
              </li>
            ))}
          </ul>
          <p className="bplan__line">
            {`Text on background ${key.ratio.toFixed(1)} to 1. ${passes ? `Passes ${key.level}` : 'Fails AA'}`}
            <span className="bplan__dot" data-pass={passes} aria-hidden="true">
              {passes ? <CheckIcon size={12} strokeWidth={2.5} /> : <CloseIcon size={12} strokeWidth={2.5} />}
            </span>
          </p>
        </div>

        <div className="bplan__section">
          <h5 className="bplan__label">Typography</h5>
          {pair ? (
            <>
              <p className="bplan__heading" style={{ fontFamily: pair.headingStack }}>{`Headings: ${pair.heading}`}</p>
              <p className="bplan__body" style={{ fontFamily: pair.bodyStack }}>{`Text: ${pair.body}. ${pair.note}`}</p>
            </>
          ) : (
            <p className="bplan__line">No typefaces chosen yet.</p>
          )}
        </div>

        <div className="bplan__section">
          <h5 className="bplan__label">Voice</h5>
          <p className="bplan__body" style={{ fontFamily: pair?.bodyStack }}>
            {voice.length > 0 ? voiceSentence(voice) : 'No words chosen yet.'}
          </p>
        </div>
      </div>

      <div className="bplan__todo">
        <h5 className="bplan__todo-title">Still to do</h5>
        <p className="bplan__todo-row">
          <span>Logo</span>
          <span>{hasLogo ? 'Resolved' : 'Outstanding'}</span>
          <StatusMark status={hasLogo ? 'resolved' : 'outstanding'} />
        </p>
        <p className="bstep__lead">Droplet does not make logos. Ask Droplet for a logo brief with these colours and typefaces, make the logo in a free tool, and bring the file back.</p>
      </div>
    </section>
  )
}
