import type { ReactNode, Ref } from 'react'
import { AltArrowLeftIcon, AltArrowRightIcon, CheckIcon } from '@solar-icons/react/linear'
import './GuideFooter.css'

type Props = {
  canBack: boolean
  onBack: () => void
  // The last part has Finish where the others have Continue.
  last: boolean
  onNext: () => void
  onFinish: () => void
  // A task whose Finish asks something first (the invoice's note of what would be remembered) puts it here, opening upwards from the button.
  finishPopup?: ReactNode
  finishExpanded?: boolean
  finishRef?: Ref<HTMLDivElement>
  // What is missing, in words. The block is a live alert, and each line goes as soon as it is fixed.
  missing: string[]
  // One sentence instead, such as why the save did not happen. It replaces the missing list.
  note?: string
  disabled?: boolean
}

// The foot of the tools panel in Guide mode, the same for every task: Back, Continue (Finish on the last part), and under them what is missing. It never sits over the
// page or the panel.
export default function GuideFooter({ canBack, onBack, last, onNext, onFinish, finishPopup, finishExpanded, finishRef, missing, note, disabled }: Props) {
  return (
    <div className="guide__actions">
      <button type="button" className="workspace__button" onClick={onBack} disabled={!canBack}>
        <AltArrowLeftIcon size={18} aria-hidden="true" />
        <span>Back</span>
      </button>
      {last ? (
        <div className="confirm guide__finish" ref={finishRef}>
          <button
            type="button"
            className="workspace__button workspace__button--primary"
            onClick={onFinish}
            disabled={disabled}
            aria-haspopup={finishPopup ? 'dialog' : undefined}
            aria-expanded={finishPopup ? finishExpanded : undefined}
          >
            <CheckIcon size={18} aria-hidden="true" />
            <span>Finish</span>
          </button>
          {finishPopup}
        </div>
      ) : (
        <button type="button" className="workspace__button workspace__button--primary guide__next" onClick={onNext}>
          <span>Continue</span>
          <AltArrowRightIcon size={18} aria-hidden="true" />
        </button>
      )}
      <div className="guide__missing" role="alert">
        {note ? (
          <p>{note}</p>
        ) : (
          missing.length > 0 && (
            <>
              <p className="guide__missing-title">{last ? 'Before you can finish:' : 'Before you go on:'}</p>
              <ul>
                {missing.slice(0, 4).map((text) => (
                  <li key={text}>{text}</li>
                ))}
                {missing.length > 4 && <li>{`And ${missing.length - 4} more.`}</li>}
              </ul>
            </>
          )
        )}
      </div>
    </div>
  )
}
