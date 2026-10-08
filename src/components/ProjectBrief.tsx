import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AddCircleIcon, CloseIcon, PenIcon, TrashBinMinimalisticIcon } from '@solar-icons/react/linear'
import { useDismiss } from '../hooks/useDismiss.ts'
import { containsPrivateDetail, factFits, factText, FACT_GROUPS, FACT_INFO, FACT_KEYS, MAX_FACT_LENGTH, type FactKey } from '../lib/facts.ts'
import type { ProjectMemory } from '../lib/memorySave.ts'
import { loadMemory, saveMemory } from '../lib/memoryStore.ts'
import { currentFacts, forgetFact, settingOn, withFact, withSetting } from '../lib/projectMemory.ts'
import BriefChats from './BriefChats.tsx'
import BriefNotes from './BriefNotes.tsx'
import './ProjectBrief.css'

type Props = {
  open: boolean
  onClose: () => void
  projectId: string
  projectName: string
  // What the brief changed, so the rest of the app reads it again.
  onChanged?: () => void
  // Chats are read and written one after another, so a change in the brief never crosses the save of a chat in progress.
  enqueue?: <T>(task: () => Promise<T>) => Promise<T>
  // Which tab opens first: what Droplet knows, or what it may look back at.
  tab?: BriefTab
}

type BriefTab = 'knows' | 'memory'

// The project brief of the selected project, in two tabs. "What Droplet knows": every fact about the business, to read, change and forget, and a way
// to add one. "Memory": the switches for how much Droplet looks back, the memories of past chats and its notes on the workspaces. A dialog over the
// page: Escape, the close button or a press outside closes it.
export default function ProjectBrief({ open, ...rest }: Props) {
  return open ? <Brief {...rest} /> : null
}

const direct = <T,>(task: () => Promise<T>) => task()

function Brief({ onClose, projectId, projectName, onChanged, enqueue = direct, tab: firstTab = 'knows' }: Omit<Props, 'open'>) {
  const [tab, setTab] = useState<BriefTab>(firstTab)
  const tabsId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDismiss(true, onClose, panelRef)
  const [memory, setMemory] = useState<ProjectMemory | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let current = true
    void loadMemory(projectId).then((loaded) => current && setMemory(loaded))
    return () => {
      current = false
    }
  }, [projectId])

  // Every change is saved as it is made, and the app is told. If it could not be stored, nothing on screen claims it was.
  const change = useCallback(
    async (next: ProjectMemory) => {
      const stored = await saveMemory(projectId, next)
      setFailed(!stored)
      if (!stored) return false
      setMemory(next)
      onChanged?.()
      return true
    },
    [projectId, onChanged],
  )

  const facts = memory ? currentFacts(memory) : {}

  const known = FACT_GROUPS.map((group) => ({ group, rows: FACT_KEYS.filter((key) => FACT_INFO[key].group === group && facts[key] !== undefined) })).filter((entry) => entry.rows.length > 0)
  const tabs: { id: BriefTab; label: string }[] = [
    { id: 'knows', label: 'What Droplet knows' },
    { id: 'memory', label: 'Memory' },
  ]

  return createPortal(
    <div className="brief__scrim">
      <div className="brief glass glass--strong" role="dialog" aria-modal="true" aria-label={`Project brief: ${projectName}`} ref={panelRef}>
        <header className="brief__header">
          <div className="brief__heading-group">
            <p className="brief__project">{projectName}</p>
            <h2 className="brief__title" id={titleId}>
              Project brief
            </h2>
          </div>
          <button type="button" className="brief__close" aria-label="Close" onClick={onClose}>
            <CloseIcon size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="brief__tabs" role="tablist" aria-label="Project brief">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`${tabsId}-${entry.id}`}
              className="brief__tab"
              aria-selected={tab === entry.id}
              aria-controls={`${tabsId}-${entry.id}-panel`}
              tabIndex={tab === entry.id ? 0 : -1}
              onClick={() => setTab(entry.id)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
                const next = tabs[(tabs.findIndex((other) => other.id === tab) + 1) % tabs.length].id
                setTab(next)
                document.getElementById(`${tabsId}-${next}`)?.focus()
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="brief__body" role="tabpanel" id={`${tabsId}-${tab}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
          {memory === null ? (
            <p className="brief__empty">Reading the brief…</p>
          ) : (
            <>
              {failed && (
                <p className="brief__error" role="alert">
                  That could not be stored, so it was not changed.
                </p>
              )}
              {tab === 'knows' ? (
                <>
                  <p className="brief__lead">Only what you confirmed is kept. Change or forget anything.</p>
                  {known.length === 0 && <p className="brief__empty">Nothing yet. Droplet asks before it keeps anything you say in a chat.</p>}
                  {known.map(({ group, rows }) => (
                    <section key={group} className="brief__section" aria-labelledby={`${titleId}-${group.replace(/\W+/g, '-')}`}>
                      <h3 className="brief__heading" id={`${titleId}-${group.replace(/\W+/g, '-')}`}>
                        {group}
                      </h3>
                      <ul className="brief__list">
                        {rows.map((key) => (
                          <FactRow key={key} factKey={key} value={facts[key]!} earlier={memory.facts?.[key]?.earlier[0]?.value} onChange={(value) => change(withFact(memory, key, value, new Date().toISOString()))} onForget={() => void change(forgetFact(memory, key))} />
                        ))}
                      </ul>
                    </section>
                  ))}
                  <AddFact memory={memory} onAdd={(key, value) => change(withFact(memory, key, value, new Date().toISOString()))} />
                </>
              ) : (
                <>
                  <section className="brief__section" aria-labelledby={`${titleId}-switches`}>
                    <h3 className="brief__heading" id={`${titleId}-switches`}>
                      What Droplet may look back at
                    </h3>
                    <div className="brief__switches">
                      <Switch label="Let Droplet look back at past chats" detail="Short summaries of earlier chats are kept, and the most relevant are sent with a message." on={settingOn(memory, 'recall')} onChange={(on) => void change(withSetting(memory, 'recall', on))} />
                      <Switch label="Keep notes on my workspaces" detail="After you save, Droplet updates its notes on the board, the palette and the invoices." on={settingOn(memory, 'notes')} onChange={(on) => void change(withSetting(memory, 'notes', on))} />
                    </div>
                  </section>
                  <BriefChats projectId={projectId} lookingBack={settingOn(memory, 'recall')} enqueue={enqueue} onChanged={onChanged} />
                  <BriefNotes projectId={projectId} projectName={projectName} keeping={settingOn(memory, 'notes')} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// One fact: the words, a way to change them, and a way to forget them that asks twice.
function FactRow({ factKey, value, earlier, onChange, onForget }: { factKey: FactKey; value: string; earlier?: string; onChange: (value: string) => Promise<boolean>; onForget: () => void }) {
  const [mode, setMode] = useState<'read' | 'edit' | 'forget'>('read')
  const [draft, setDraft] = useState(value)
  const [problem, setProblem] = useState('')
  const label = FACT_INFO[factKey].label

  const save = async () => {
    const words = factText(draft)
    if (!factFits(words)) return setProblem(problemWith(words))
    if (words !== value && !(await onChange(words))) return setProblem('That could not be stored.')
    setProblem('')
    setMode('read')
  }

  return (
    <li className="brief__row">
      <span className="brief__label">{label}</span>
      {mode === 'edit' ? (
        <span className="brief__edit">
          <input className="brief__input" value={draft} maxLength={MAX_FACT_LENGTH + 20} aria-label={label} autoFocus onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void save()} />
          <button type="button" className="brief__small brief__small--primary" onClick={() => void save()}>
            Save
          </button>
          <button
            type="button"
            className="brief__small"
            onClick={() => {
              setMode('read')
              setProblem('')
            }}
          >
            Cancel
          </button>
          {problem && (
            <span className="brief__error" role="alert">
              {problem}
            </span>
          )}
        </span>
      ) : (
        <span className="brief__value">
          <span>{value}</span>
          {earlier && <span className="brief__earlier">Before: {earlier}</span>}
        </span>
      )}
      {mode === 'read' && (
        <span className="brief__actions">
          <button
            type="button"
            className="brief__icon"
            aria-label={`Edit ${label}`}
            onClick={() => {
              setDraft(value)
              setMode('edit')
            }}
          >
            <PenIcon size={16} aria-hidden="true" />
          </button>
          <button type="button" className="brief__icon" aria-label={`Forget ${label}`} onClick={() => setMode('forget')}>
            <TrashBinMinimalisticIcon size={16} aria-hidden="true" />
          </button>
        </span>
      )}
      {mode === 'forget' && (
        <span className="brief__ask">
          <span>Forget this?</span>
          <button type="button" className="brief__small brief__small--danger" onClick={onForget}>
            Forget
          </button>
          <button type="button" className="brief__small" onClick={() => setMode('read')}>
            Keep
          </button>
        </span>
      )}
    </li>
  )
}

const problemWith = (words: string) =>
  containsPrivateDetail(words)
    ? 'Droplet is never given an address, an email, a phone number or a bank detail, so a fact cannot hold one.'
    : words === ''
      ? 'Write something first.'
      : `A fact is up to ${MAX_FACT_LENGTH} characters.`

// Something Droplet should know that has not come up in a chat.
function AddFact({ memory, onAdd }: { memory: ProjectMemory; onAdd: (key: FactKey, value: string) => Promise<boolean> }) {
  const [key, setKey] = useState<FactKey>('profile.what')
  const [value, setValue] = useState('')
  const [problem, setProblem] = useState('')
  const facts = currentFacts(memory)
  const selectId = useId()
  const inputId = useId()

  const [open, setOpen] = useState(false)

  const add = async () => {
    const words = factText(value)
    if (!factFits(words)) return setProblem(problemWith(words))
    if (!(await onAdd(key, words))) return setProblem('That could not be stored.')
    setValue('')
    setProblem('')
  }

  if (!open)
    return (
      <button type="button" className="brief__add-open" onClick={() => setOpen(true)}>
        <AddCircleIcon size={18} aria-hidden="true" />
        Add something Droplet should know
      </button>
    )

  return (
    <section className="brief__section brief__adding" aria-label="Add something Droplet should know">
      <div className="brief__add">
        <label className="visually-hidden" htmlFor={selectId}>
          About
        </label>
        <select id={selectId} className="brief__input brief__select" value={key} onChange={(event) => setKey(event.target.value as FactKey)}>
            {FACT_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {FACT_KEYS.filter((candidate) => FACT_INFO[candidate].group === group).map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {FACT_INFO[candidate].label}
                    {facts[candidate] !== undefined ? ' (replaces what is there)' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
        <label className="visually-hidden" htmlFor={inputId}>
          What Droplet should know
        </label>
        <input id={inputId} className="brief__input brief__field--wide" autoFocus value={value} maxLength={MAX_FACT_LENGTH + 20} placeholder={FACT_INFO[key].hint} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void add()} autoComplete="off" />
      </div>
      <div className="brief__add-actions">
        <button
          type="button"
          className="brief__small"
          onClick={() => {
            setOpen(false)
            setValue('')
            setProblem('')
          }}
        >
          Done
        </button>
        <button type="button" className="brief__small brief__small--primary" onClick={() => void add()}>
          Add
        </button>
      </div>
      {problem && (
        <p className="brief__error" role="alert">
          {problem}
        </p>
      )}
    </section>
  )
}

function Switch({ label, detail, on, onChange }: { label: string; detail: string; on: boolean; onChange: (on: boolean) => void }) {
  const id = useId()
  return (
    <div className="brief__switch">
      <span className="brief__switch-text">
        <label htmlFor={id}>{label}</label>
        <span className="brief__detail" id={`${id}-detail`}>
          {detail}
        </span>
      </span>
      <input id={id} className="brief__toggle" type="checkbox" role="switch" checked={on} onChange={(event) => onChange(event.target.checked)} aria-describedby={`${id}-detail`} />
    </div>
  )
}
