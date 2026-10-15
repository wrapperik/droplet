import type { ReactNode } from 'react'
import { CheckIcon, DisketteIcon, FullScreenIcon, MinimizeSquareIcon, ShuffleIcon, UndoLeftIcon, UndoRightIcon } from '@solar-icons/react/linear'
import type { ShellHistory } from './WorkspaceShell.tsx'
import './BrandToolbar.css'

type Props = {
  history: ShellHistory
  // The Download button, made by the workspace (it is an `ExportButton` with `iconOnly`).
  download: ReactNode
  // Save is pressable once what was saved has been read. `unsaved` only decides which icon it shows.
  canSave: boolean
  unsaved: boolean
  onSave: () => void
  // Where saving stands, or why it could not be done, for a screen reader.
  status: string
  // Generate random: a random base colour and a random harmony. Off when every colour is kept.
  canRandom: boolean
  onRandom: () => void
  // Full screen: the palette takes the whole width and the colour tools are hidden. Not saved.
  fullscreen: boolean
  onFullscreen: () => void
}

// The brand's toolbar: one flat row across the top of the frame, of pill buttons in glass, with no container round them. On the left, the things that change the
// work (Undo, Redo, Generate random, Full screen); on the right, the things that keep it (Download, Save). Every pill is an icon and its name.
export default function BrandToolbar({ history, download, canSave, unsaved, onSave, status, canRandom, onRandom, fullscreen, onFullscreen }: Props) {
  return (
    <div className="btool">
      <div className="btool__row" role="toolbar" aria-label="Palette toolbar">
        <div className="btool__cluster">
          <button type="button" className="btool__pill" disabled={!history.canUndo} onClick={history.undo}>
            <UndoLeftIcon size={18} aria-hidden="true" />
            <span>Undo</span>
          </button>
          <button type="button" className="btool__pill" disabled={!history.canRedo} onClick={history.redo}>
            <UndoRightIcon size={18} aria-hidden="true" />
            <span>Redo</span>
          </button>
          <button type="button" className="btool__pill btool__pill--primary" disabled={!canRandom} onClick={onRandom} title={canRandom ? undefined : 'Every colour is kept, so there is nothing to fill in'}>
            <ShuffleIcon size={18} aria-hidden="true" />
            <span>Generate random</span>
          </button>
          <button type="button" className="btool__pill" aria-pressed={fullscreen} onClick={onFullscreen}>
            {fullscreen ? <MinimizeSquareIcon size={18} aria-hidden="true" /> : <FullScreenIcon size={18} aria-hidden="true" />}
            <span>{fullscreen ? 'Exit full screen' : 'Full screen'}</span>
          </button>
        </div>

        <div className="btool__cluster">
          {download}
          <button type="button" className="btool__pill" disabled={!canSave} onClick={onSave}>
            {unsaved ? <DisketteIcon size={18} aria-hidden="true" /> : <CheckIcon size={18} aria-hidden="true" />}
            <span>{unsaved ? 'Save' : 'Saved'}</span>
          </button>
        </div>
      </div>
      <p className="visually-hidden" role="status">
        {status}
      </p>
    </div>
  )
}
