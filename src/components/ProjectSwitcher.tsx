import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AddCircleIcon, CheckIcon, ChevronsUpDownIcon, LibraryIcon, PenIcon } from '@solar-icons/react/linear'
import { useDismiss } from '../hooks/useDismiss.ts'
import type { ProjectSummary } from '../lib/mockProjects.ts'
import { checkProjectName, MAX_PROJECT_NAME } from '../lib/projectNames.ts'
import './ProjectSwitcher.css'

// What the parent says after trying: null if it worked, otherwise what to tell the founder.
type Outcome = Promise<string | null>

type Props = {
  projects: ProjectSummary[]
  currentId: string
  collapsed: boolean
  onSelect: (id: string) => void
  // Makes a project with this name (already checked) and moves to it. Without it the item is shown but cannot be used.
  onCreate?: (name: string) => Outcome
  // Gives the current project this name (already checked).
  onRename?: (name: string) => Outcome
}

type Mode = 'list' | 'create' | 'rename'

const FORM_TITLES: Record<Exclude<Mode, 'list'>, { title: string; submit: string }> = {
  create: { title: 'New project', submit: 'Create project' },
  rename: { title: 'Rename project', submit: 'Rename' },
}

export default function ProjectSwitcher({ projects, currentId, collapsed, onSelect, onCreate, onRename }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('list')
  const wrapRef = useRef<HTMLDivElement>(null)
  // A press outside, or Escape, closes the menu, but not while a project is being made: the form would vanish under a request on its way.
  const saving = useRef(false)
  const close = useCallback(() => {
    if (saving.current) return
    setOpen(false)
    setMode('list')
  }, [])
  useDismiss(open, close, wrapRef)

  const current = projects.find((project) => project.id === currentId) ?? projects[0]

  return (
    <div className="switcher" ref={wrapRef}>
      <button
        type="button"
        className="switcher__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={collapsed ? `Project: ${current.name}` : undefined}
        title={collapsed ? current.name : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <LibraryIcon className="switcher__icon" size={20} aria-hidden="true" />
        <span className="switcher__name">{current.name}</span>
        <ChevronsUpDownIcon className="switcher__chevron" size={16} aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="switcher__menu glass glass--strong"
            role={mode === 'list' ? 'menu' : undefined}
            aria-label="Projects"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {mode !== 'list' ? (
              <NameForm
                key={mode}
                title={FORM_TITLES[mode].title}
                submit={FORM_TITLES[mode].submit}
                initial={mode === 'rename' ? current.name : ''}
                projects={projects}
                exceptId={mode === 'rename' ? current.id : undefined}
                onBusy={(busy) => (saving.current = busy)}
                onSave={(name) => (mode === 'create' ? onCreate!(name) : onRename!(name))}
                onDone={close}
                onCancel={() => setMode('list')}
              />
            ) : (
              <>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                role="menuitemradio"
                aria-checked={project.id === currentId}
                className="switcher__item"
                onClick={() => {
                  setOpen(false)
                  onSelect(project.id)
                }}
              >
                <LibraryIcon className="switcher__item-icon" size={20} aria-hidden="true" />
                <span className="switcher__item-name">{project.name}</span>
                {project.id === currentId && <CheckIcon size={16} aria-hidden="true" />}
              </button>
            ))}
            <hr className="switcher__divider" />
            <button
              type="button"
              role="menuitem"
              className="switcher__item switcher__item--new"
              aria-disabled={!onCreate || undefined}
              title={onCreate ? undefined : 'Projects cannot be added here.'}
              onClick={() => onCreate && setMode('create')}
            >
              <AddCircleIcon size={18} aria-hidden="true" />
              <span className="switcher__item-name">New project</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="switcher__item switcher__item--new"
              aria-disabled={!onRename || undefined}
              title={onRename ? undefined : 'This project cannot be renamed here.'}
              onClick={() => onRename && setMode('rename')}
            >
              <PenIcon size={18} aria-hidden="true" />
              <span className="switcher__item-name">Rename project</span>
            </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

type FormProps = {
  title: string
  submit: string
  initial: string
  projects: ProjectSummary[]
  exceptId?: string
  // Tells the menu whether a request is on its way, so it does not close under it.
  onBusy: (busy: boolean) => void
  onSave: (name: string) => Outcome
  onDone: () => void
  onCancel: () => void
}

// One field for a project's name. It checks the name first (empty, too long, one the founder already has) and only then asks the parent to
// make or change the project. If that fails it says so and keeps what was typed.
function NameForm({ title, submit, initial, projects, exceptId, onBusy, onSave, onDone, onCancel }: FormProps) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const working = useRef(false)
  const ids = { field: useId(), error: useId() }

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submitForm = async (event: FormEvent) => {
    event.preventDefault()
    // A second press while it is being saved does nothing.
    if (working.current) return
    const checked = checkProjectName(value, projects, exceptId)
    if (!checked.ok) {
      setError(checked.error)
      inputRef.current?.focus()
      return
    }
    setError(null)
    working.current = true
    onBusy(true)
    setBusy(true)
    let failure: string | null
    try {
      failure = await onSave(checked.name)
    } catch {
      failure = 'Something went wrong. Please try again.'
    }
    working.current = false
    onBusy(false)
    setBusy(false)
    if (failure === null) onDone()
    else {
      setError(failure)
      inputRef.current?.focus()
    }
  }

  return (
    <form className="switcher__form" aria-label={title} onSubmit={submitForm} noValidate>
      <label className="switcher__label" htmlFor={ids.field}>
        Business or project name
      </label>
      <input
        id={ids.field}
        ref={inputRef}
        className="switcher__input"
        type="text"
        value={value}
        maxLength={MAX_PROJECT_NAME * 2}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? ids.error : undefined}
        onChange={(event) => {
          setValue(event.target.value)
          setError(null)
        }}
      />
      {error && (
        <p id={ids.error} className="switcher__error" role="alert">
          {error}
        </p>
      )}
      <div className="switcher__actions">
        <button type="button" className="switcher__small" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="switcher__small switcher__small--primary" aria-disabled={busy || undefined}>
          {busy ? 'Saving' : submit}
        </button>
      </div>
    </form>
  )
}
