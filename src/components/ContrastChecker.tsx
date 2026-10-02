import { CheckIcon, CloseIcon } from '@solar-icons/react/linear'
import { contrastLevel, contrastRatio, hexToRgb, rgbToHex } from '../lib/colour.ts'
import './ContrastChecker.css'

type Props = {
  // The colour to check, as a hex string.
  hex: string
  // Which colour this is checking, for the heading, such as "Colour 2".
  checking?: string
  // One line saying why this component is on screen (manifesto principle 3).
  reason: string
}

// The two text colours the readout checks against. These are data for the maths, not styling.
const TEXT_COLOURS = [
  { label: 'White text', hex: '#FFFFFF' },
  { label: 'Ink text', hex: '#0E1A2B' },
]

// Computed in code from the WCAG 2.x formula. The result is never left to the model.
export default function ContrastChecker({ hex, checking, reason }: Props) {
  const background = hexToRgb(hex)

  return (
    <section className="contrast glass glass--strong" aria-label="Contrast checker">
      <header>
        <h2 className="contrast__title">Contrast</h2>
        <p className="contrast__reason">{reason}</p>
      </header>

      <p className="contrast__checking">
        <span className="contrast__swatch" style={{ background: hex }} aria-hidden="true" />
        {checking ? `${checking}, ` : ''}
        {hex.toUpperCase()}
      </p>

      <div className="contrast__tiles">
        {TEXT_COLOURS.map((text) => {
          const ratio = contrastRatio(background, hexToRgb(text.hex))
          const level = contrastLevel(ratio)
          const passes = level !== 'fail'
          return (
            <div className="contrast__tile" key={text.label}>
              <div className="contrast__sample" style={{ background: hex, color: rgbToHex(hexToRgb(text.hex)) }}>
                Aa
              </div>
              <p className="contrast__label">{text.label}</p>
              <p className="contrast__ratio">
                {ratio.toFixed(2)}:1
                <span className="contrast__verdict">
                  {passes ? `Passes ${level}` : 'Fails AA'}
                  <span className={`contrast__dot contrast__dot--${passes ? 'pass' : 'fail'}`} aria-hidden="true">
                    {passes ? <CheckIcon size={12} strokeWidth={2.25} /> : <CloseIcon size={12} strokeWidth={2.25} />}
                  </span>
                </span>
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
