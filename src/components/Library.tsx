import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { AltArrowLeftIcon } from '@solar-icons/react/linear'
import { drawBoard } from '../lib/boardDrawing.ts'
import { loadBoard } from '../lib/boardStore.ts'
import { exportLibraryItem, forgetLibraryItem, type ActionResult, type ExportTarget, type ForgetTarget, type OpenTarget } from '../lib/libraryActions.ts'
import {
  libraryOf,
  roleLabel,
  type BrandItem,
  type BusinessItem,
  type ClientItem,
  type DetailsItem,
  type IdeasItem,
  type InvoiceItem,
  type Library as LibraryData,
  type LibraryActionId,
  type LibraryItem,
  type LogoItem,
} from '../lib/library.ts'
import { loadLogo } from '../lib/logoStore.ts'
import { loadMemory } from '../lib/memoryStore.ts'
import { loadNotes } from '../lib/notesStore.ts'
import { settingOn } from '../lib/projectMemory.ts'
import { loadPalette } from '../lib/projectStore.ts'
import BriefNotes from './BriefNotes.tsx'
import StatusMark from './StatusMark.tsx'
import './Library.css'

type Props = {
  projectId: string
  projectName: string
  // Read again when this changes, so something Droplet did while the library was open shows.
  version?: number
  // Goes back to what was open before, or to the full chat if nothing was.
  onClose: () => void
  // Opens a workspace on a thing. Resolves to "unsaved" when the invoice that is open holds changes that opening this would lose, so the library
  // can ask first. With `confirmed` it goes ahead.
  onOpen: (target: OpenTarget, options?: { confirmed?: boolean }) => Promise<'done' | 'unsaved'>
  // Asks Droplet something, in the founder's name, such as to help write a logo brief.
  onAsk: (text: string) => void
  // Opens the logo handoff card, where the founder gets the spec and adds the logo they made.
  onOpenHandoff?: () => void
  // Something was forgotten or exported, so the rest of the app reads the project again.
  onChanged?: () => void
}

// The library: everything the founder has made for this project, in the order they meet it, where each thing stands, and what they can do with it.
// It is a view of what is saved. It changes nothing on its own: each button does one thing, and a forget asks twice.
export default function Library({ projectId, projectName, version = 0, onClose, onOpen, onAsk, onOpenHandoff, onChanged }: Props) {
  const titleId = useId()
  const [library, setLibrary] = useState<LibraryData | null>(null)
  const [notesOn, setNotesOn] = useState(true)
  // The last thing done, in words, for a screen reader and for the eye. An error is not a note.
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  // Which thing is being exported, so its button says so and a second press is ignored.
  const [working, setWorking] = useState<string | null>(null)
  // A forget that has been asked for and not yet confirmed, by item id.
  const [forgetting, setForgetting] = useState<string | null>(null)
  // An open that would lose unsaved changes in the invoice that is open, waiting for the founder's say.
  const [replacing, setReplacing] = useState<{ target: OpenTarget; what: string } | null>(null)

  const load = useCallback(async () => {
    const [palette, board, memory, notes, logo] = await Promise.all([loadPalette(projectId), loadBoard(projectId), loadMemory(projectId), loadNotes(projectId), loadLogo(projectId)])
    return { data: libraryOf({ palette, board, memory, notes, logo }), notesOn: settingOn(memory, 'notes') }
  }, [projectId])

  useEffect(() => {
    let current = true
    void load().then((loaded) => {
      if (!current) return
      setLibrary(loaded.data)
      setNotesOn(loaded.notesOn)
    })
    return () => {
      current = false
    }
  }, [load, version])

  const reload = useCallback(async () => {
    const loaded = await load()
    setLibrary(loaded.data)
    setNotesOn(loaded.notesOn)
  }, [load])

  const say = (result: ActionResult) => setNotice(result.ok ? { ok: true, text: result.text } : { ok: false, text: result.reason })

  const exportItem = async (id: string, target: ExportTarget) => {
    if (working) return
    setWorking(id)
    setNotice(null)
    try {
      say(await exportLibraryItem(projectId, projectName, target))
      await reload()
      onChanged?.()
    } finally {
      setWorking(null)
    }
  }

  const forget = async (target: ForgetTarget, what: string) => {
    setForgetting(null)
    const done = await forgetLibraryItem(projectId, target)
    setNotice(done ? { ok: true, text: `Forgot ${what}.` } : { ok: false, text: `Could not forget ${what}: it could not be stored.` })
    await reload()
    onChanged?.()
  }

  const open = async (target: OpenTarget, what: string, confirmed = false) => {
    const result = await onOpen(target, { confirmed })
    if (result === 'unsaved') setReplacing({ target, what })
    else setReplacing(null)
  }

  const copyHex = async (item: BrandItem) => {
    try {
      await navigator.clipboard.writeText(item.swatches.map((swatch) => swatch.hex).join(', '))
      setNotice({ ok: true, text: 'Copied the hex codes.' })
    } catch {
      setNotice({ ok: false, text: 'Could not copy. Select the codes and copy them yourself.' })
    }
  }

  // The button for an action on an item, and what it does.
  const button = (item: LibraryItem, action: LibraryActionId): ReactNode => {
    const plain = (label: string, run: () => void, extra?: { aria?: string; busy?: boolean }) => (
      <button key={action} type="button" className="library__button" aria-label={extra?.aria} aria-busy={extra?.busy || undefined} onClick={run}>
        {label}
      </button>
    )
    switch (item.section) {
      case 'business':
        if (action === 'change') return plain('Change', () => void open({ kind: 'board' }, 'the board'), { aria: 'Change the name or the offer on the board' })
        if (action === 'forget') return askForget(item.id, 'the name and the offer', () => void forget({ kind: 'idea' }, 'the name and the offer'), 'Forget')
        return null
      case 'brand':
        if (action === 'open' && item.paletteId) return plain('Open', () => void open({ kind: 'brand', paletteId: item.paletteId }, `the palette ${item.title}`), { aria: `Open the palette ${item.title}` })
        if (action === 'open') return plain('Open', () => void open({ kind: 'brand' }, 'the palette'), { aria: 'Open the palette' })
        if (action === 'forget' && item.paletteId) return askForget(item.id, `the palette ${item.title}`, () => void forget({ kind: 'palette', id: item.paletteId! }, `the palette ${item.title}`), 'Forget')
        if (action === 'export') return plain(working === item.id ? 'Preparing' : 'Export brand sheet', () => void exportItem(item.id, { kind: 'brand' }), { busy: working === item.id })
        if (action === 'copy_hex') return plain('Copy hex codes', () => void copyHex(item))
        return null
      case 'logo':
        if (action === 'handoff' && onOpenHandoff) return plain(item.file ? 'Logo and files' : 'Open handoff card', onOpenHandoff, { aria: item.file ? 'Open the logo card to replace or remove your logo' : 'Open the logo handoff card' })
        if (action === 'make_brief') return plain('Make the brief', () => onAsk('Help me write a short brief for my logo.'), { aria: 'Ask Droplet to help make a logo brief' })
        return null
      case 'ideas':
        if (action === 'open') return plain('Open', () => void open({ kind: 'board' }, 'the board'), { aria: 'Open the board' })
        if (action === 'export_png') return plain(working === `${item.id}:png` ? 'Preparing' : 'Export PNG', () => void exportItem(`${item.id}:png`, { kind: 'ideas', format: 'png' }), { busy: working === `${item.id}:png` })
        if (action === 'export_pdf') return plain(working === `${item.id}:pdf` ? 'Preparing' : 'Export PDF', () => void exportItem(`${item.id}:pdf`, { kind: 'ideas', format: 'pdf' }), { busy: working === `${item.id}:pdf` })
        return null
      case 'invoices':
        if (action === 'open') return plain('Open', () => void open({ kind: 'invoice', id: item.invoiceId }, item.title), { aria: `Open ${item.title}` })
        if (action === 'copy') return plain('Copy', () => void open({ kind: 'copy_invoice', id: item.invoiceId }, `a copy of ${item.title}`), { aria: `Make a new invoice from ${item.title}` })
        if (action === 'export') return plain(working === item.id ? 'Preparing' : 'Export PDF', () => void exportItem(item.id, { kind: 'invoice', id: item.invoiceId }), { aria: `Export ${item.title} as a PDF`, busy: working === item.id })
        if (action === 'forget') return askForget(item.id, item.title, () => void forget({ kind: 'invoice', id: item.invoiceId }, item.title), 'Forget')
        return null
      case 'clients':
        if (action === 'new_invoice') return plain('New invoice', () => void open({ kind: 'new_invoice', clientId: item.clientId }, `an invoice for ${item.title}`), { aria: `New invoice for ${item.title}` })
        if (action === 'forget') return askForget(item.id, item.title, () => void forget({ kind: 'client', id: item.clientId }, item.title), 'Forget')
        return null
      case 'details':
        if (action === 'edit') return plain('Edit', () => void open({ kind: 'business_details' }, 'the invoice'), { aria: 'Edit your business details in the invoice' })
        return null
      default:
        return null
    }
  }

  // A forget that asks twice: the first press asks, the second does it.
  const askForget = (id: string, what: string, run: () => void, label: string): ReactNode =>
    forgetting === id ? (
      <span key={`forget-${id}`} className="library__ask">
        <span>Forget {what}?</span>
        <button type="button" className="library__button library__button--danger" onClick={run}>
          Forget
        </button>
        <button type="button" className="library__button" onClick={() => setForgetting(null)}>
          Keep
        </button>
      </span>
    ) : (
      <button key={`forget-${id}`} type="button" className="library__button" aria-label={`Forget ${what}`} onClick={() => setForgetting(id)}>
        {label}
      </button>
    )

  const actionsOf = (item: LibraryItem) => item.actions.length > 0 && <div className="library__actions">{item.actions.map((action) => button(item, action))}</div>

  return (
    <div className="library" aria-labelledby={titleId}>
      <header className="library__header">
        <button type="button" className="library__back" onClick={onClose}>
          <AltArrowLeftIcon size={18} aria-hidden="true" />
          Back
        </button>
        <h2 className="library__title" id={titleId}>
          Library
        </h2>
        <p className="library__lead">Everything saved for {projectName}, and where each thing stands. Nothing here is changed unless you press a button.</p>
      </header>

      <div className="library__notices">
        {notice && (
          <p className={`library__notice${notice.ok ? '' : ' library__notice--error'}`} role={notice.ok ? 'status' : 'alert'}>
            {notice.text}
          </p>
        )}
        {replacing && (
          <p className="library__notice library__notice--ask" role="alert">
            <span>
              {replacing.target.kind === 'brand' ? 'The palette' : 'The invoice'} you have open has changes that are not saved. Opening {replacing.what} loses them.
            </span>
            <span className="library__ask">
              <button type="button" className="library__button library__button--danger" onClick={() => void open(replacing.target, replacing.what, true)}>
                Open anyway
              </button>
              <button type="button" className="library__button" onClick={() => setReplacing(null)}>
                Cancel
              </button>
            </span>
          </p>
        )}
      </div>

      {library === null ? (
        <p className="library__empty">Reading the library…</p>
      ) : (
        library.sections.map((section) => {
          const headingId = `${titleId}-${section.id}`
          return (
            <section key={section.id} className="library__section" aria-labelledby={headingId}>
              <h3 className="library__heading" id={headingId}>
                {section.title}
              </h3>
              {section.id === 'notes' ? (
                <BriefNotes projectId={projectId} projectName={projectName} keeping={notesOn} />
              ) : section.items.length === 0 ? (
                <div className="library__empty-card">
                  <p>{section.empty.text}</p>
                  {section.empty.action && section.empty.actionLabel && (
                    <button
                      type="button"
                      className="library__button"
                      onClick={() => void open(section.empty.action === 'open_brand' ? { kind: 'brand' } : section.empty.action === 'open_board' ? { kind: 'board' } : { kind: 'new_invoice' }, section.empty.actionLabel!.toLowerCase())}
                    >
                      {section.empty.actionLabel}
                    </button>
                  )}
                </div>
              ) : (
                <ul className="library__list">
                  {section.items.map((item) => (
                    <li key={item.id} className="library__item">
                      {renderItem(item)}
                      {actionsOf(item)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}

// ---- What each kind of item shows ----

const Status = ({ item }: { item: LibraryItem }) => (
  <span className="library__status">
    <StatusMark status={item.status} />
    <span>{item.statusLabel}</span>
  </span>
)

function renderItem(item: LibraryItem): ReactNode {
  switch (item.section) {
    case 'business':
      return <Business item={item} />
    case 'brand':
      return <Brand item={item} />
    case 'logo':
      return <Logo item={item} />
    case 'ideas':
      return <Ideas item={item} />
    case 'invoices':
      return <Invoice item={item} />
    case 'clients':
      return <Client item={item} />
    case 'details':
      return <Details item={item} />
    // The notes are drawn by their own list, which can change them.
    case 'notes':
      return null
  }
}

function Business({ item }: { item: BusinessItem }) {
  return (
    <div className="library__body">
      <p className="library__name">{item.title}</p>
      {item.offer && <p className="library__line">{item.offer}</p>}
      <Status item={item} />
      {item.facts.length > 0 && (
        <dl className="library__facts">
          {item.facts.map((fact) => (
            <div key={fact.key}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="library__hint">Facts are changed in the project brief, from the project menu.</p>
    </div>
  )
}

function Brand({ item }: { item: BrandItem }) {
  return (
    <div className="library__body">
      {item.paletteId && <p className="library__name">{item.title}</p>}
      <div className="library__swatches" role="img" aria-label={`Palette: ${item.swatches.map((swatch) => `${swatch.hex}${swatch.role ? `, ${roleLabel(swatch.role)}` : ''}`).join('; ')}`}>
        {item.swatches.map((swatch, index) => (
          <span key={index} className="library__swatch" style={{ background: swatch.hex }} title={swatch.hex} />
        ))}
      </div>
      <p className="library__line">
        Text on background {item.contrast.ratio}: <strong>{item.contrast.verdict}</strong>
      </p>
      <Status item={item} />
      {item.exportedAt && <p className="library__hint">Brand sheet exported {new Date(item.exportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.</p>}
    </div>
  )
}

function Logo({ item }: { item: LogoItem }) {
  return (
    <div className={item.file ? 'library__body library__body--picture' : 'library__body'}>
      {item.file && <img className="library__logo" src={item.file.dataUrl} alt={`Your logo, ${item.file.name}`} />}
      <div className="library__side">
        <p className="library__name">{item.title}</p>
        <Status item={item} />
        {item.file ? (
          <p className="library__line">
            {item.file.name}, {item.file.kind.toUpperCase()}. Made in another tool and kept with this project.
          </p>
        ) : (
          <p className="library__line">Droplet does not make logos. A free tool such as Canva or Adobe Express can, and the handoff card has the colours, fonts and files to ask it for.</p>
        )}
        {item.brief && <p className="library__line">What you told Droplet: {item.brief}</p>}
      </div>
    </div>
  )
}

function Ideas({ item }: { item: IdeasItem }) {
  return (
    <div className="library__body library__body--picture">
      <BoardPicture items={item.items} />
      <div className="library__side">
        <p className="library__line">
          {item.notes} {item.notes === 1 ? 'note' : 'notes'}, {item.frames} {item.frames === 1 ? 'frame' : 'frames'}
          {item.other > 0 ? `, ${item.other} other ${item.other === 1 ? 'thing' : 'things'}` : ''}
        </p>
        <Status item={item} />
        {item.exportedAt && <p className="library__hint">Exported {new Date(item.exportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.</p>}
      </div>
    </div>
  )
}

// A small picture of the board, drawn from the same marks the PNG and the PDF are made from, without the words, which would not be readable.
function BoardPicture({ items }: { items: IdeasItem['items'] }) {
  const drawing = drawBoard(items)
  if (!drawing) return null
  const stroke = (mark: { stroke: string | null; strokeWidth: number }) => (mark.stroke ? { stroke: mark.stroke, strokeWidth: mark.strokeWidth } : {})
  return (
    <svg className="library__picture" viewBox={`0 0 ${drawing.width} ${drawing.height}`} role="img" aria-label="A small picture of the board" preserveAspectRatio="xMidYMid meet">
      {drawing.marks.map((mark, index) => {
        if (mark.kind === 'rect') return <rect key={index} x={mark.x} y={mark.y} width={mark.w} height={mark.h} rx={mark.radius} fill={mark.fill ?? 'none'} {...stroke(mark)} />
        if (mark.kind === 'ellipse') return <ellipse key={index} cx={mark.x + mark.w / 2} cy={mark.y + mark.h / 2} rx={mark.w / 2} ry={mark.h / 2} fill={mark.fill ?? 'none'} {...stroke(mark)} />
        if (mark.kind === 'polygon') return <polygon key={index} points={mark.points.map((point) => `${point.x},${point.y}`).join(' ')} fill={mark.fill ?? 'none'} {...stroke(mark)} />
        if (mark.kind === 'line') return <polyline key={index} points={mark.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={mark.stroke} strokeWidth={mark.strokeWidth} />
        return null
      })}
    </svg>
  )
}

function Invoice({ item }: { item: InvoiceItem }) {
  return (
    <div className="library__body">
      <div className="library__row">
        <p className="library__name">{item.title}</p>
        <p className="library__amount">{item.total}</p>
      </div>
      <p className="library__line">{item.client || 'No client yet'}</p>
      <Status item={item} />
    </div>
  )
}

function Client({ item }: { item: ClientItem }) {
  return (
    <div className="library__body">
      <p className="library__name">{item.title}</p>
      <Status item={item} />
    </div>
  )
}

function Details({ item }: { item: DetailsItem }) {
  return (
    <div className="library__body">
      <p className="library__name">{item.title}</p>
      <ul className="library__checks">
        {item.filled.map((entry) => (
          <li key={entry.label}>
            <span className={entry.filled ? 'library__check library__check--on' : 'library__check'} aria-hidden="true" />
            {entry.label}: {entry.filled ? 'filled in' : 'not filled in'}
          </li>
        ))}
      </ul>
      <Status item={item} />
    </div>
  )
}
