import { CheckIcon, HourglassIcon } from '@solar-icons/react/linear'
import type { AssetStatus } from '../lib/mockProjects.ts'
import './StatusMark.css'

// Status is never shown by colour alone: always a word and an icon.
// The word stays in the normal text colour; the icon sits in a filled circle in the status colour.
export default function StatusMark({ status }: { status: AssetStatus }) {
  const resolved = status === 'resolved'
  const StatusIcon = resolved ? CheckIcon : HourglassIcon

  return (
    <span className={`status status--${status}`}>
      {resolved ? 'Resolved' : 'Outstanding'}
      <span className="status__dot" aria-hidden="true">
        <StatusIcon size={12} strokeWidth={2.25} />
      </span>
    </span>
  )
}
