import { keyPairs } from '../lib/brandParts.ts'
import type { ResolvedRoles } from '../lib/palette.ts'
import ContrastBadge from './ContrastBadge.tsx'
import './ContrastPart.css'

// The Contrast part: each pair of roles that matters, with the colours, the ratio and a word and an icon for whether it passes AA, never colour alone. The
// ratios are worked out in code from the colours, never guessed.
export default function ContrastPart({ roles }: { roles: ResolvedRoles }) {
  const pairs = keyPairs(roles)
  return (
    <>
      <ul className="contrast">
        {pairs.map((pair) => (
          <li key={pair.id} className="contrast__row">
            <span className="contrast__sample" style={{ background: pair.background, color: pair.foreground }} aria-hidden="true">
              Aa
            </span>
            <span className="contrast__text">
              <span className="contrast__label">{pair.label}</span>
              <span className="contrast__hex">{`${pair.foreground} on ${pair.background}`}</span>
            </span>
            <ContrastBadge ratio={pair.ratio} level={pair.level} />
          </li>
        ))}
      </ul>
      <p className="contrast__note">AA is a ratio of 4.5 to 1, the level for body text. Choose different colours or roles until the text on the background passes.</p>
    </>
  )
}
