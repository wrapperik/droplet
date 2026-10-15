import { CheckIcon } from '@solar-icons/react/linear'
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/inter'
import '@fontsource-variable/playfair-display'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/lora'
import { FONT_PAIRS } from '../lib/brandType.ts'
import type { ResolvedRoles } from '../lib/palette.ts'
import './BrandSteps.css'

type Props = {
  value: string | null
  onChange: (id: string) => void
  roles: ResolvedRoles
  businessName: string
}

// Step two of the brand guide: six pairs of typefaces, each shown as a heading and a line of reading text in the palette's own background and text colours. One is chosen.
export default function BrandTypography({ value, onChange, roles, businessName }: Props) {
  return (
    <section className="bstep" data-part="typography" tabIndex={-1} aria-label="Typography">
      <h3 className="bstep__title">Typography</h3>
      <p className="bstep__lead">Choose the pair your business will use. Heading first, then the text you read.</p>
      <div className="bstep__fonts" role="radiogroup" aria-label="Typeface pairs">
        {FONT_PAIRS.map((pair) => {
          const selected = value === pair.id
          return (
            <label key={pair.id} className="bfont" data-selected={selected} style={{ background: roles.background.hex, color: roles.text.hex }}>
              <input className="bstep__input" type="radio" name="font-pair" checked={selected} onChange={() => onChange(pair.id)} aria-label={`${pair.name}: ${pair.heading} with ${pair.body}`} />
              <span className="bfont__name" style={{ color: roles.text.hex }}>
                {pair.name}
                {selected && (
                  <span className="bfont__tick" style={{ background: roles.text.hex, color: roles.background.hex }} aria-hidden="true">
                    <CheckIcon size={14} strokeWidth={2.5} />
                  </span>
                )}
              </span>
              <span className="bfont__heading" style={{ fontFamily: pair.headingStack, color: roles.text.hex }}>
                {businessName}
              </span>
              <span className="bfont__body" style={{ fontFamily: pair.bodyStack }}>
                Handmade gift boxes from makers you can meet. Ordered by Thursday, delivered by Friday.
              </span>
              <span className="bfont__names">{`${pair.heading} and ${pair.body}`}</span>
              <span className="bfont__note">{pair.note}</span>
            </label>
          )
        })}
      </div>
    </section>
  )
}
