import { CheckIcon, CloseIcon } from '@solar-icons/react/linear'
import { contrastLevel, contrastRatio, hexToRgb } from '../lib/colour.ts'
import { Toolbar, ToolbarDivider } from './Toolbar.tsx'
import './ContrastChecker.css'

type Props = {
  // The colour to check, as a hex string.
  hex: string
  // Which colour this is checking, such as "Colour 2".
  checking?: string
  // One line saying why this component is on screen (manifesto principle 3).
  reason: string
}

// The two text colours the readout checks against. These are data for the maths, not styling.
const TEXT_COLOURS = [
  { label: 'White text', hex: '#FFFFFF' },
  { label: 'Ink text', hex: '#0E1A2B' },
]

// A toolbar of two checks: the selected colour as a background for white text and for Ink text.
// Computed in code from the WCAG 2.x formula. The result is never left to the model.
export default function ContrastChecker({ hex, checking = 'Colour', reason }: Props) {
  const background = hexToRgb(hex)

  return (
    <Toolbar title="Contrast" reason={reason}>
      <span className="contrast__subject">
        <span className="contrast__dot-swatch" style={{ background: hex }} aria-hidden="true" />
        {checking}
      </span>
      {TEXT_COLOURS.map((text) => {
        const ratio = contrastRatio(background, hexToRgb(text.hex))
        const level = contrastLevel(ratio)
        const passes = level !== 'fail'
        return (
          <div className="contrast__check" key={text.label}>
            <ToolbarDivider />
            <span className="contrast__sample" style={{ background: hex, color: text.hex }} aria-hidden="true">
              Aa
            </span>
            <span className="contrast__text">
              <span className="contrast__ratio">
                {ratio.toFixed(2)}:1<span className="contrast__label">{text.label}</span>
              </span>
              <span className="contrast__verdict">
                {passes ? `Passes ${level}` : 'Fails AA'}
                <span className={`contrast__dot contrast__dot--${passes ? 'pass' : 'fail'}`} aria-hidden="true">
                  {passes ? <CheckIcon size={11} strokeWidth={2.5} /> : <CloseIcon size={11} strokeWidth={2.5} />}
                </span>
              </span>
            </span>
          </div>
        )
      })}
    </Toolbar>
  )
}
