import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseCircleIcon, LinkIcon } from '@solar-icons/react/linear'
import { useDismiss } from '../hooks/useDismiss.ts'
import { brandOf, type Brand } from '../lib/logoBrand.ts'
import { LOGO_MAX_BYTES, LOGO_TOOLS, colourLine, logoSpec, specRows, specText } from '../lib/logoHandoff.ts'
import { clearLogo, importLogo, loadLogo, type LogoSave } from '../lib/logoStore.ts'
import { loadMemory } from '../lib/memoryStore.ts'
import { loadPalette } from '../lib/projectStore.ts'
import CopyText from './CopyText.tsx'
import SpecRows, { type SpecRowView } from './SpecRows.tsx'
import StatusMark from './StatusMark.tsx'
import './LogoHandoff.css'

type Props = {
  projectId: string
  onClose: () => void
  // The logo was added or taken away, so the rest of the app reads the project again.
  onChanged?: () => void
  // The palette is missing: opens the brand workspace.
  onOpenBrand?: () => void
}

// Where Droplet stops. It does not make logos, so this says so plainly and hands over everything the founder needs: the colours and fonts to ask for
// (the saved palette's, in code), the files to ask for, a free tool to start in (opened in a new tab: their sign-in does not work inside another app),
// and a slot for the file that comes back. Until it does, the logo is outstanding. Nothing is sent anywhere: the file is read in the browser and kept
// with the project.
export default function LogoHandoff(props: Props) {
  return createPortal(<Card {...props} />, document.body)
}

function Card({ projectId, onClose, onChanged, onOpenBrand }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  useDismiss(true, onClose, panelRef)
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  const [brand, setBrand] = useState<Brand | null>(null)
  const [logo, setLogo] = useState<LogoSave | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let current = true
    void Promise.all([loadPalette(projectId), loadMemory(projectId), loadLogo(projectId)]).then(([palette, memory, saved]) => {
      if (!current) return
      setBrand(brandOf({ memory, palette }))
      setLogo(saved)
    })
    return () => {
      current = false
    }
  }, [projectId])

  const take = useCallback(
    async (file: File | undefined) => {
      if (!file || working) return
      setWorking(true)
      setReason(null)
      setNote(null)
      try {
        const result = await importLogo(projectId, file)
        if (result.ok) {
          setLogo(result.logo)
          setNote('Your logo is added. It is marked as made in the library.')
          onChanged?.()
        } else {
          setReason(result.reason)
        }
      } finally {
        setWorking(false)
        if (inputRef.current) inputRef.current.value = ''
      }
    },
    [onChanged, projectId, working],
  )

  const remove = async () => {
    if (working) return
    setWorking(true)
    try {
      await clearLogo(projectId)
      setLogo(null)
      setRemoving(false)
      setReason(null)
      setNote('The logo is removed. It is outstanding again.')
      onChanged?.()
    } finally {
      setWorking(false)
    }
  }

  const spec = brand ? logoSpec({ palette: { blocks: brand.colours.map((colour) => ({ hex: colour.hex, role: colour.role })) }, fontsFact: brand.fontsFact }) : null
  const rows: SpecRowView[] = spec
    ? specRows(spec).map((row) =>
        row.id === 'colours' && spec.colours.length > 0 ? { ...row, swatches: spec.colours.map((colour) => ({ hex: colour.hex, label: colourLine(colour) })) } : row,
      )
    : []

  return (
    <div className="logo-handoff__scrim">
      <div className="logo-handoff glass glass--strong" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef}>
        <header className="logo-handoff__header">
          <div>
            <h2 className="logo-handoff__title" id={titleId}>
              Get a logo
            </h2>
            <p className="logo-handoff__status">
              <StatusMark status={logo ? 'resolved' : 'outstanding'} />
              <span>{logo ? 'Resolved: your logo is added' : 'Outstanding: made outside Droplet'}</span>
            </p>
          </div>
          <button type="button" ref={closeRef} className="logo-handoff__close" aria-label="Close" onClick={onClose}>
            <CloseCircleIcon size={22} aria-hidden="true" />
          </button>
        </header>

        <div className="logo-handoff__body">
          <p className="logo-handoff__why">
            Droplet does not make logos or images. Take the details below to a free design tool, then add the file here.
          </p>

          <section className="logo-handoff__section" aria-labelledby={`${titleId}-spec`}>
            <div className="logo-handoff__section-head">
              <h3 id={`${titleId}-spec`}>What to ask for</h3>
              {spec && brand && <CopyText text={specText({ name: brand.name, spec })} label="the whole spec">Copy all</CopyText>}
            </div>
            {spec ? <SpecRows rows={rows} label="Logo spec" /> : <p className="logo-handoff__muted">Reading your project.</p>}
            {spec && spec.colours.length === 0 && (
              <p className="logo-handoff__muted">
                No palette is saved, so there are no colours to give the tool.{' '}
                {onOpenBrand && (
                  <button type="button" className="logo-handoff__link" onClick={onOpenBrand}>
                    Build the brand first
                  </button>
                )}
              </p>
            )}
          </section>

          <section className="logo-handoff__section" aria-labelledby={`${titleId}-tools`}>
            <h3 id={`${titleId}-tools`}>Where to start</h3>
            <ul className="logo-handoff__tools" role="list">
              {LOGO_TOOLS.map((tool) => (
                <li key={tool.id} className="logo-handoff__tool">
                  <a href={tool.url} target="_blank" rel="noopener noreferrer" className="logo-handoff__tool-link">
                    <LinkIcon size={16} aria-hidden="true" />
                    <span>
                      {tool.name}
                      <span className="visually-hidden"> (opens in a new tab)</span>
                    </span>
                  </a>
                  <span className="logo-handoff__muted">{tool.note}</span>
                </li>
              ))}
            </ul>
            <p className="logo-handoff__muted">They open in a new tab. Come back here with the file.</p>
          </section>

          <section className="logo-handoff__section" aria-labelledby={`${titleId}-import`}>
            <h3 id={`${titleId}-import`}>Add your logo</h3>
            {logo ? (
              <div className="logo-handoff__added">
                <img className="logo-handoff__preview" src={logo.dataUrl} alt={`Your logo, ${logo.name}`} />
                <div className="logo-handoff__added-side">
                  <p className="logo-handoff__muted">
                    {logo.name}, {logo.kind.toUpperCase()}, {Math.max(1, Math.round(logo.size / 1000))} KB
                  </p>
                  <div className="logo-handoff__buttons">
                    <button type="button" className="logo-handoff__button" disabled={working} onClick={() => inputRef.current?.click()}>
                      Replace
                    </button>
                    {removing ? (
                      <>
                        <button type="button" className="logo-handoff__button logo-handoff__button--danger" disabled={working} onClick={() => void remove()}>
                          Remove the logo
                        </button>
                        <button type="button" className="logo-handoff__button" onClick={() => setRemoving(false)}>
                          Keep it
                        </button>
                      </>
                    ) : (
                      <button type="button" className="logo-handoff__button" disabled={working} onClick={() => setRemoving(true)}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="logo-handoff__slot"
                data-over={over || undefined}
                onDragOver={(event) => {
                  event.preventDefault()
                  setOver(true)
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setOver(false)
                  void take(event.dataTransfer.files[0])
                }}
              >
                <p className="logo-handoff__slot-text">Drop the file here, or</p>
                <button type="button" className="logo-handoff__button" disabled={working} aria-busy={working || undefined} onClick={() => inputRef.current?.click()}>
                  {working ? 'Adding' : 'Choose a file'}
                </button>
                <p className="logo-handoff__muted">A PNG or an SVG, up to {LOGO_MAX_BYTES / 1_000_000} MB. It stays with this project and is not sent anywhere else.</p>
              </div>
            )}
            <input ref={inputRef} type="file" accept=".png,.svg,image/png,image/svg+xml" className="visually-hidden" tabIndex={-1} aria-label="Logo file" onChange={(event) => void take(event.target.files?.[0])} />
            {reason && (
              <p className="logo-handoff__reason" role="alert">
                {reason}
              </p>
            )}
            {note && (
              <p className="logo-handoff__note" role="status">
                {note}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
