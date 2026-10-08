import { useEffect } from 'react'
import './Toast.css'

export type ToastMessage = { id: number; text: string; actionLabel?: string; onAction?: () => void }

type Props = {
  toast: ToastMessage | null
  onDismiss: () => void
}

const SHOWN_MS = 8000

// A quiet note at the foot of the screen that goes by itself, with one thing that can be done about it, such as Undo. A screen reader is told when it
// appears. The same note is not shown again if it is replaced by another with a new id.
export default function Toast({ toast, onDismiss }: Props) {
  const id = toast?.id
  useEffect(() => {
    if (id === undefined) return
    const timer = window.setTimeout(onDismiss, SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [id, onDismiss])

  if (!toast) return null
  return (
    <div className="toast glass glass--strong" role="status">
      <span className="toast__text">{toast.text}</span>
      {toast.actionLabel && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            toast.onAction?.()
            onDismiss()
          }}
        >
          {toast.actionLabel}
        </button>
      )}
    </div>
  )
}
