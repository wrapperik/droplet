import { useId, type ChangeEvent, type ReactNode } from 'react'
import { CheckIcon, DisketteIcon, FullScreenIcon, MinimizeSquareIcon, ShuffleIcon, UndoLeftIcon, UndoRightIcon } from '@solar-icons/react/linear'
import type { NamedPalette } from '../lib/namedPalettes.ts'
import { PALETTE_NAME_MAX } from '../lib/namedPalettes.ts'
import SavedPalettes from './SavedPalettes.tsx'
import type { ShellHistory } from './WorkspaceShell.tsx'
import './BrandToolbar.css'

type Props = {
  history: ShellHistory
  // The Download button, made by the workspace (it is an `ExportButton` with `iconOnly`).
  download: ReactNode
  // Naming and keeping the palette.
  name: string
  onName: (name: string) => void
  // Why the name cannot be used, if it cannot. Save is held back and the reason is shown.
  nameProblem: string | null
  // Save is always pressable once what was saved has been read, because the name can change on its own. `unsaved` only decides what it says.
  canSave: boolean
  unsaved: boolean
  onSave: () => void
  // A quiet line on where saving stands, and the last thing saving did.
  status: string
  // The palettes this project has named and kept.
  palettes: NamedPalette[]
  onOpenPalette: (palette: NamedPalette) => void
  onForgetPalette: (palette: NamedPalette) => void
  // Generate random: a random base colour and a random harmony. Off when every colour is kept.
  canRandom: boolean
  onRandom: () => void
  // Full screen: the preview takes the whole width and the tools are hidden. Not saved.
  fullscreen: boolean
  onFullscreen: () => void
}

// The brand's toolbar: one flat row across the top of the frame, of pill buttons in glass, with no container round them. On the left, the things that keep the work
// (Download, Save, the palette's name, the saved palettes); on the right, the things that change it (Undo, Redo, Generate random, Full screen). Under it, a quiet line.
export default function BrandToolbar({
  history,
  download,
  name,
  onName,
  nameProblem,
  canSave,
  unsaved,
  onSave,
  status,
  palettes,
  onOpenPalette,
  onForgetPalette,
  canRandom,
  onRandom,
  fullscreen,
  onFullscreen,
}: Props) {
  const nameId = useId()
  const problemId = useId()
  return (
    <div className="btool">
      <div className="btool__row" role="toolbar" aria-label="Palette toolbar">
        <div className="btool__cluster">
          {download}
          <button type="button" className="btool__pill btool__pill--icon" disabled={!canSave || nameProblem !== null} onClick={onSave} aria-label={unsaved ? 'Save' : 'Saved'} title={unsaved ? 'Save the palette' : 'Saved. Press to save again, for example under a new name.'}>
            {unsaved ? <DisketteIcon size={18} aria-hidden="true" /> : <CheckIcon size={18} aria-hidden="true" />}
          </button>
          <div className="btool__name">
            <input
              id={nameId}
              className="btool__name-input"
              value={name}
              placeholder=" "
              maxLength={PALETTE_NAME_MAX + 20}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onName(event.target.value)}
              aria-invalid={nameProblem !== null}
              aria-describedby={nameProblem !== null ? problemId : undefined}
              autoComplete="off"
              spellCheck={false}
            />
            <label htmlFor={nameId} className="btool__name-label">
              Palette name
            </label>
          </div>
          <SavedPalettes palettes={palettes} unsaved={unsaved} onOpen={onOpenPalette} onForget={onForgetPalette} />
        </div>

        <div className="btool__cluster btool__cluster--end">
          <button type="button" className="btool__pill btool__pill--icon" disabled={!history.canUndo} onClick={history.undo} aria-label="Undo" title="Undo">
            <UndoLeftIcon size={18} aria-hidden="true" />
          </button>
          <button type="button" className="btool__pill btool__pill--icon" disabled={!history.canRedo} onClick={history.redo} aria-label="Redo" title="Redo">
            <UndoRightIcon size={18} aria-hidden="true" />
          </button>
          <button type="button" className="btool__pill btool__pill--primary" disabled={!canRandom} onClick={onRandom} title={canRandom ? 'A random base colour and a random harmony, in one step you can undo' : 'Every colour is kept, so there is nothing to fill in'}>
            <ShuffleIcon size={18} aria-hidden="true" />
            <span>Generate random</span>
          </button>
          <button
            type="button"
            className="btool__pill btool__pill--icon"
            aria-pressed={fullscreen}
            aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            title={fullscreen ? 'Exit full screen (Escape)' : 'Full screen'}
            onClick={onFullscreen}
          >
            {fullscreen ? <MinimizeSquareIcon size={18} aria-hidden="true" /> : <FullScreenIcon size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <p id={problemId} className="btool__note" role={nameProblem ? 'alert' : 'status'} data-problem={nameProblem ? '' : undefined}>
        {nameProblem ?? status}
      </p>
    </div>
  )
}
