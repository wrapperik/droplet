import { useId, useRef, useState, type DragEvent } from 'react'
import { GalleryAddIcon, RefreshIcon, UploadMinimalisticIcon } from '@solar-icons/react/linear'
import { readableTextColour } from '../lib/colour.ts'
import { IMAGE_RULE } from '../lib/imagePalette.ts'
import { readImageColours } from '../lib/imageColours.ts'
import './ImageSource.css'

// How many colours are taken from a picture.
export const IMAGE_COLOURS = 5

type Props = {
  // The founder chose to use what was taken: the palette becomes these colours, as one undo step.
  onUse: (colours: string[]) => void
}

type State = { phase: 'idle' } | { phase: 'reading'; name: string } | { phase: 'done'; name: string; colours: string[] } | { phase: 'failed'; reason: string }

// Takes a palette from a picture. The picture is read in this browser and let go: it is not uploaded, not stored and not sent to Droplet. The result is shown first,
// and only "Use this palette" changes the palette.
export default function ImageSource({ onUse }: Props) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>({ phase: 'idle' })
  const [over, setOver] = useState(false)
  // A newer picture makes an older one that is still being read irrelevant.
  const latest = useRef(0)

  const take = async (file: File | undefined) => {
    if (!file) return
    const mine = ++latest.current
    setState({ phase: 'reading', name: file.name })
    const result = await readImageColours(file, IMAGE_COLOURS)
    if (mine !== latest.current) return
    if (!result.ok) return setState({ phase: 'failed', reason: result.reason })
    if (result.colours.length < 2) return setState({ phase: 'failed', reason: 'That picture has only one main colour, and a palette needs at least two. Try a picture with more colour in it.' })
    setState({ phase: 'done', name: file.name, colours: result.colours })
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setOver(false)
    void take(event.dataTransfer.files?.[0])
  }

  return (
    <div className="isource">
      <div
        className="isource__drop"
        data-over={over || undefined}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <GalleryAddIcon size={28} aria-hidden="true" />
        <button type="button" className="isource__upload" onClick={() => inputRef.current?.click()}>
          <UploadMinimalisticIcon size={18} aria-hidden="true" />
          Upload your image
        </button>
        <p className="isource__or">Or drag and drop here</p>
        <p className="isource__rule" id={`${inputId}-rule`}>
          {IMAGE_RULE}
        </p>
        <input
          ref={inputRef}
          id={inputId}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Choose a picture to take colours from"
          aria-describedby={`${inputId}-rule`}
          tabIndex={-1}
          onChange={(event) => {
            void take(event.target.files?.[0])
            // The same picture can be chosen again.
            event.target.value = ''
          }}
        />
      </div>

      <p className="isource__privacy">The picture is read on this device only. It is not uploaded or kept.</p>

      <div role="status" className="isource__status">
        {state.phase === 'reading' && `Reading ${state.name}…`}
      </div>
      {state.phase === 'failed' && (
        <p className="isource__error" role="alert">
          {state.reason}
        </p>
      )}
      {state.phase === 'done' && (
        <div className="isource__result">
          <p className="isource__found">{`Colours taken from ${state.name}`}</p>
          <ul className="isource__swatches" aria-label="Colours taken from the picture">
            {state.colours.map((hex) => (
              <li key={hex} className="isource__swatch" style={{ background: hex, color: readableTextColour(hex) }}>
                {hex}
              </li>
            ))}
          </ul>
          <div className="isource__buttons">
            <button type="button" className="isource__use" onClick={() => onUse(state.colours)}>
              Use this palette
            </button>
            <button type="button" className="isource__again" onClick={() => inputRef.current?.click()}>
              <RefreshIcon size={16} aria-hidden="true" />
              Choose another picture
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
