import { useCallback, useId, useRef, useState } from 'react'
import { BookmarkIcon } from '@solar-icons/react/linear'
import { LAYER_ATTRIBUTE, useDismiss } from '../hooks/useDismiss.ts'
import { newestFirst, type NamedPalette } from '../lib/namedPalettes.ts'
import './SavedPalettes.css'

type Props = {
  palettes: NamedPalette[]
  // The palette on screen has colours that are not saved, which opening another would lose. Opening then asks first.
  unsaved: boolean
  onOpen: (palette: NamedPalette) => void
  onForget: (palette: NamedPalette) => void
}

const when = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date)
}

// "Saved palettes": a button that opens a list of the palettes this project has named and kept. Open puts one in the workspace (as one undo step, done by the
// caller), after asking if the palette on screen has unsaved changes; Forget asks twice. It draws on the page below the button and closes on Escape or a press outside.
export default function SavedPalettes({ palettes, unsaved, onOpen, onForget }: Props) {
  const [open, setOpen] = useState(false)
  // The row that is being asked about, and what about it.
  const [asking, setAsking] = useState<{ id: string; what: 'open' | 'forget' } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const listed = newestFirst(palettes)

  const close = useCallback(() => {
    setOpen(false)
    setAsking(null)
  }, [])
  useDismiss(open, close, wrapRef)

  return (
    <div className="saved" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btool__pill"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation()
            close()
          }
        }}
      >
        <BookmarkIcon size={18} aria-hidden="true" />
        <span>Saved palettes</span>
        {palettes.length > 0 && <span className="saved__count">{palettes.length}</span>}
      </button>
      {open && (
        <div className="saved__popover glass glass--strong" role="dialog" aria-labelledby={titleId} {...{ [LAYER_ATTRIBUTE]: '' }}>
          <h3 className="saved__title" id={titleId}>
            Saved palettes
          </h3>
          {listed.length === 0 ? (
            <p className="saved__empty">No palettes are saved yet. Name your palette and press Save to keep it here.</p>
          ) : (
            <ul className="saved__list">
              {listed.map((palette) => {
                const asked = asking?.id === palette.id ? asking.what : null
                return (
                  <li key={palette.id} className="saved__row">
                    <span className="saved__swatches" aria-hidden="true">
                      {palette.blocks.map((block) => (
                        <span key={block.id} style={{ background: block.hex }} />
                      ))}
                    </span>
                    <span className="saved__text">
                      <span className="saved__name">{palette.name}</span>
                      <span className="saved__when">{`Kept ${when(palette.savedAt)}`}</span>
                    </span>
                    {asked === null && (
                      <span className="saved__buttons">
                        <button
                          type="button"
                          className="saved__button"
                          aria-label={`Open ${palette.name}`}
                          onClick={() => {
                            if (unsaved) return setAsking({ id: palette.id, what: 'open' })
                            onOpen(palette)
                            close()
                            buttonRef.current?.focus()
                          }}
                        >
                          Open
                        </button>
                        <button type="button" className="saved__button" aria-label={`Forget ${palette.name}`} onClick={() => setAsking({ id: palette.id, what: 'forget' })}>
                          Forget
                        </button>
                      </span>
                    )}
                    {asked === 'open' && (
                      <span className="saved__ask" role="alert">
                        <span>The palette on screen has changes that are not saved. Open {palette.name} and lose them?</span>
                        <span className="saved__buttons">
                          <button
                            type="button"
                            className="saved__button saved__button--danger"
                            onClick={() => {
                              onOpen(palette)
                              close()
                              buttonRef.current?.focus()
                            }}
                          >
                            Open anyway
                          </button>
                          <button type="button" className="saved__button" onClick={() => setAsking(null)}>
                            Keep working
                          </button>
                        </span>
                      </span>
                    )}
                    {asked === 'forget' && (
                      <span className="saved__ask" role="alert">
                        <span>{`Forget ${palette.name}?`}</span>
                        <span className="saved__buttons">
                          <button
                            type="button"
                            className="saved__button saved__button--danger"
                            onClick={() => {
                              onForget(palette)
                              setAsking(null)
                            }}
                          >
                            Forget it
                          </button>
                          <button type="button" className="saved__button" onClick={() => setAsking(null)}>
                            Keep it
                          </button>
                        </span>
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
