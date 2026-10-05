import { FullScreenIcon } from '@solar-icons/react/linear'
import './ChatBar.css'

type Props = {
  // A workspace is open, so the conversation is in the side panel and can be made the whole screen again.
  onFullScreen?: () => void
  // Droplet is working on a reply, so the conversation cannot be changed under it.
  busy?: boolean
}

// The control of the conversation that is not in the sidebar: with a workspace open, a way back to the conversation as the whole screen.
// Starting a chat and finding an earlier one are in the sidebar. With nothing to offer it draws nothing.
export default function ChatBar({ onFullScreen, busy = false }: Props) {
  if (!onFullScreen) return null
  return (
    <div className="chatbar">
      <span className="chatbar__spacer" />
      <button type="button" className="chatbar__button" disabled={busy} aria-label="Back to the full chat" title="Back to the full chat" onClick={onFullScreen}>
        <FullScreenIcon size={18} aria-hidden="true" />
      </button>
    </div>
  )
}
