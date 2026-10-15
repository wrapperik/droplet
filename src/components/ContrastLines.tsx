import { useState, type ReactNode } from 'react'
import { MagicWand3Icon } from '@solar-icons/react/linear'
import { BRAND_LEADS, keyPairs } from '../lib/brandParts.ts'
import type { ResolvedRoles } from '../lib/palette.ts'
import ContrastBadge from './ContrastBadge.tsx'
import { ReasonTip } from './Toolbar.tsx'
import './ContrastLines.css'

type Props = {
  roles: ResolvedRoles
  // Guide mode's step: also offers "Make it more readable" while the text fails AA, which moves the text (or, if it cannot, the background) in code as one undo
  // step and says in words what it did, and adds the one line on what AA is.
  onMakeReadable?: () => string | null
  // Without its own heading and region, for a place that already has a heading (the Guide step's section).
  bare?: boolean
}

// The contrast of each pair of roles that matters, one line each: a sample, the pair, the ratio, and a word and an icon for whether it passes AA, never colour
// alone. The ratios are worked out in code from the colours, never guessed. No box: the lines sit on the screen, divided by hairlines.
export default function ContrastLines({ roles, onMakeReadable, bare = false }: Props) {
  const pairs = keyPairs(roles)
  const [said, setSaid] = useState('')
  const textFails = pairs[0].level === 'fail'
  return (
    <Wrapper bare={bare}>
      {!bare && (
        <header className="clines__header">
          <h3 className="clines__title">Contrast</h3>
          <ReasonTip reason={BRAND_LEADS.contrast} />
        </header>
      )}
      <ul className="clines__list">
        {pairs.map((pair) => (
          <li key={pair.id} className="clines__row">
            <span className="clines__sample" style={{ background: pair.background, color: pair.foreground }} aria-hidden="true">
              Aa
            </span>
            <span className="clines__text">
              <span className="clines__label">{pair.label}</span>
              <span className="clines__hex">{`${pair.foreground} on ${pair.background}`}</span>
            </span>
            <ContrastBadge ratio={pair.ratio} level={pair.level} />
          </li>
        ))}
      </ul>
      {onMakeReadable && textFails && (
        <button type="button" className="clines__fix" onClick={() => setSaid(onMakeReadable() ?? 'I could not find a colour that reads here. Change the text or the background yourself.')}>
          <MagicWand3Icon size={18} aria-hidden="true" />
          Make it more readable
        </button>
      )}
      {onMakeReadable && (
        <p className="clines__said" role="status">
          {said}
        </p>
      )}
      {onMakeReadable && <p className="clines__note">AA is a ratio of 4.5 to 1, the level for body text. Choose different colours or roles until the text on the background passes.</p>}
    </Wrapper>
  )
}

function Wrapper({ bare, children }: { bare: boolean; children: ReactNode }) {
  return bare ? (
    <div className="clines">{children}</div>
  ) : (
    <section className="clines" data-part="contrast" tabIndex={-1} aria-label="Contrast of the key pairs">
      {children}
    </section>
  )
}
