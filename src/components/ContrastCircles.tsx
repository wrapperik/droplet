import { CheckIcon, CloseIcon } from '@solar-icons/react/linear'
import { CONTRAST_LEAD } from '../lib/brandParts.ts'
import { pairResult, type PaletteBlock, type ResolvedRoles } from '../lib/palette.ts'
import { ReasonTip } from './Toolbar.tsx'
import './ContrastCircles.css'

type Props = {
  blocks: PaletteBlock[]
  roles: ResolvedRoles
}

// One circle for each colour of the palette: the colour itself with a large "A" on it, and whether the A reads. The A is in the text colour; the text colour's own
// circle shows the background colour on it instead. The ratio is worked out in code, from the colours, and is in the circle's name for a screen reader. Passing
// or failing is a word and an icon, never colour alone.
export default function ContrastCircles({ blocks, roles }: Props) {
  return (
    <section className="ccircles" data-part="contrast" tabIndex={-1} aria-label="Contrast">
      <header className="ccircles__header">
        <h3 className="ccircles__title">Contrast</h3>
        <ReasonTip reason={CONTRAST_LEAD} />
      </header>
      <ul className="ccircles__list" style={{ '--count': blocks.length } as React.CSSProperties}>
        {blocks.map((block, index) => {
          const ink = block.id === roles.text.blockId ? roles.background.hex : roles.text.hex
          const { ratio, level } = pairResult(ink, block.hex)
          const passes = level !== 'fail'
          const words = passes ? `Passes ${level}` : 'Fails AA'
          return (
            <li key={block.id} className="ccircles__item">
              <span className="ccircles__circle" style={{ background: block.hex, color: ink }} role="img" aria-label={`Colour ${index + 1}, ${block.hex}: text on it is ${ratio.toFixed(1)} to 1`}>
                <span className="ccircles__a" aria-hidden="true">
                  A
                </span>
              </span>
              <span className="ccircles__result">
                {words}
                <span className={`ccircles__dot ccircles__dot--${passes ? 'pass' : 'fail'}`} aria-hidden="true">
                  {passes ? <CheckIcon size={14} strokeWidth={2.5} /> : <CloseIcon size={14} strokeWidth={2.5} />}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
