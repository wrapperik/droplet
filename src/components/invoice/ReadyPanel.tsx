import { CheckIcon, HourglassIcon } from '@solar-icons/react/linear'
import type { Issue, Readiness } from '../../lib/invoiceReadiness.ts'
import '../StatusMark.css'
import './ReadyPanel.css'

// A status is a word and an icon, never colour alone, the same as an asset's status in the sidebar.
function Status({ ready, count }: { ready: boolean; count: number }) {
  const StatusIcon = ready ? CheckIcon : HourglassIcon
  return (
    <span className={`status ${ready ? 'status--resolved' : 'status--outstanding'}`}>
      {ready ? 'Ready to export' : count === 1 ? '1 thing to fix' : `${count} things to fix`}
      <span className="status__dot" aria-hidden="true">
        <StatusIcon size={12} strokeWidth={2.25} />
      </span>
    </span>
  )
}

function IssueList({ issues, onFix }: { issues: Issue[]; onFix: (issue: Issue) => void }) {
  return (
    <ul className="ready__list">
      {issues.map((issue) => (
        <li key={issue.id} className="ready__item">
          <span>{issue.text}</span>
          <button type="button" className="ready__fix" onClick={() => onFix(issue)} aria-label={`${issue.text} Go and fix it.`}>
            Fix
          </button>
        </li>
      ))}
    </ul>
  )
}

// The Review part: every required item named, with a button that goes to the part of the invoice that fixes it, and then what is
// only worth adding. Nothing here is hidden once the invoice is ready: the suggestions stay, since they never block.
export function ReadyPart({ readiness, onFix }: { readiness: Readiness; onFix: (issue: Issue) => void }) {
  return (
    <>
      <div className="ready">
        <Status ready={readiness.ready} count={readiness.required.length} />
        {readiness.ready ? (
          <p className="ready__lead">Everything the invoice needs is filled in. Press Export to download the PDF.</p>
        ) : (
          <>
            <h3 className="ready__heading">Needed before you can export</h3>
            <IssueList issues={readiness.required} onFix={onFix} />
          </>
        )}
        {readiness.recommended.length > 0 && (
          <>
            <h3 className="ready__heading">Worth adding</h3>
            <IssueList issues={readiness.recommended} onFix={onFix} />
          </>
        )}
      </div>
    </>
  )
}
