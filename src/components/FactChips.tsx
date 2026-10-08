import { factLabel, type FactKey } from '../lib/facts.ts'
import './FactChips.css'

// A fact Droplet offers to remember, shown to the founder under the reply it came from. `was` is what is remembered now, when this would change it.
export type ProposalView = { key: FactKey; value: string; was?: string }

type Props = {
  proposals: ProposalView[]
  onRemember: (key: FactKey) => void
  onNotNow: (key: FactKey) => void
}

// What Droplet offers to remember, under its reply. Nothing is remembered until the founder presses the button: Droplet only proposes. A fact that would
// change what is remembered shows both, and the founder chooses which to keep.
export default function FactChips({ proposals, onRemember, onNotNow }: Props) {
  if (proposals.length === 0) return null
  return (
    <ul className="facts" aria-label="Facts Droplet can remember">
      {proposals.map((proposal) => {
        const label = factLabel(proposal.key)
        const update = proposal.was !== undefined
        return (
          <li key={proposal.key} className="facts__chip">
            <span className="facts__text">
              {update ? (
                <>
                  <span className="facts__lead">Update {label.toLowerCase()}.</span>
                  <span className="facts__was">Was: {proposal.was}.</span>
                  <span className="facts__now">Now: {proposal.value}.</span>
                </>
              ) : (
                <>
                  <span className="facts__lead">Remember: {proposal.value}</span>
                  <span className="facts__label">{label}</span>
                </>
              )}
            </span>
            <span className="facts__actions">
              <button type="button" className="facts__button facts__button--primary" onClick={() => onRemember(proposal.key)} aria-label={`${update ? 'Update' : 'Remember'}: ${label}, ${proposal.value}`}>
                {update ? 'Update' : 'Remember'}
              </button>
              <button type="button" className="facts__button" onClick={() => onNotNow(proposal.key)} aria-label={`${update ? 'Keep the old' : 'Not now'}: ${label}`}>
                {update ? 'Keep the old' : 'Not now'}
              </button>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
