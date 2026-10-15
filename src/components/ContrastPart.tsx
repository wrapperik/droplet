import { useState } from 'react'
import { MagicWand3Icon } from '@solar-icons/react/linear'
import { keyPairs } from '../lib/brandParts.ts'
import type { ResolvedRoles } from '../lib/palette.ts'
import ContrastBadge from './ContrastBadge.tsx'
import './ContrastPart.css'

// The Contrast part: each pair of roles that matters, with the colours, the ratio and a word and an icon for whether it passes AA, never colour alone. The
// ratios are worked out in code from the colours, never guessed.
// In Guide mode it also offers "Make it more readable" while the text fails AA: `onMakeReadable` moves the text (or, if it cannot, the background) in code, as one undo
// step, and says in words what it did.
export default function ContrastPart({ roles, onMakeReadable }: { roles: ResolvedRoles; onMakeReadable?: () => string | null }) {
  const pairs = keyPairs(roles)
  const [said, setSaid] = useState('')
  const textFails = pairs[0].level === 'fail'
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
      {onMakeReadable && textFails && (
        <button type="button" className="contrast__fix" onClick={() => setSaid(onMakeReadable() ?? 'I could not find a colour that reads here. Change the text or the background yourself.')}>
          <MagicWand3Icon size={18} aria-hidden="true" />
          Make it more readable
        </button>
      )}
      {onMakeReadable && (
        <p className="contrast__said" role="status">
          {said}
        </p>
      )}
      <p className="contrast__note">AA is a ratio of 4.5 to 1, the level for body text. Choose different colours or roles until the text on the background passes.</p>
    </>
  )
}
