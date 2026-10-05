import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AltArrowLeftIcon, ArrowRightIcon, CalculatorIcon, CheckCircleIcon, ShieldCheckIcon } from '@solar-icons/react/linear'
import Wordmark from '../components/Wordmark.tsx'
import { INTRO_SLIDES, NAME_STEP, planFirstProject } from '../lib/onboarding.ts'
import { cleanProjectName, MAX_PROJECT_NAME } from '../lib/projectNames.ts'
import { createProject, listProjects, renameProject } from '../lib/projectsStore.ts'
import { useAuth } from '../store/auth.ts'
import Scene, { type SceneId } from './WelcomeScenes.tsx'
import './Welcome.css'

// The introduction, shown once after a founder makes an account (and at /welcome after that): what Droplet is, how it differs, what it does
// and who decides, in a few words and one picture each, then a name for the first project. It is the one screen that is not the app, so it
// uses the app's own wave, glass and type. Nothing in it needs an answer: it can be skipped, and the project can be left unnamed.

const POINT_ICONS = [CheckCircleIcon, CalculatorIcon, ShieldCheckIcon]

// Names the first project as the founder typed it: the one made for them is renamed, otherwise one is made. False if it could not be done,
// and then nothing is marked as finished, so they can try again.
async function nameFirstProject(typed: string): Promise<boolean> {
  if (cleanProjectName(typed) === '') return true
  const projects = await listProjects()
  if (!projects) return false
  const plan = planFirstProject(projects, typed)
  if (plan.kind === 'create') return (await createProject(plan.name)) !== null
  if (plan.kind === 'rename') return (await renameProject(plan.id, plan.name)) !== null
  return true
}

type Step = { id: SceneId; label: string; title: string; lead?: string; points?: string[] }

export default function Welcome() {
  const user = useAuth((state) => state.user)
  const completeOnboarding = useAuth((state) => state.completeOnboarding)
  const navigate = useNavigate()
  // A founder who has been through it already (looking again) is not asked to name a project: they have one. Read once, since finishing
  // changes it.
  const [naming] = useState(() => !(user?.onboarded ?? false))
  const steps: Step[] = [...INTRO_SLIDES, ...(naming ? [{ id: 'name' as const, ...NAME_STEP }] : [])]
  const last = steps.length - 1

  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const ids = { name: useId(), form: useId(), problem: useId() }

  const go = (next: number) => {
    if (busy) return
    const clamped = Math.min(Math.max(next, 0), last)
    if (clamped === index) return
    setDirection(clamped > index ? 1 : -1)
    setIndex(clamped)
    setProblem('')
  }

  // The arrow keys turn the pages, except in the field, which keeps them for the cursor.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (event.key === 'ArrowRight') go(index + 1)
      else if (event.key === 'ArrowLeft') go(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const finish = async (typed: string) => {
    if (busy) return
    setBusy(true)
    setProblem('')
    if (naming && !(await nameFirstProject(typed))) {
      setProblem('We could not set up your project. Try again.')
      setBusy(false)
      return
    }
    await completeOnboarding()
    navigate('/home', { replace: true })
  }

  if (!user) return <Navigate to="/sign-in" replace />

  const step = steps[index]
  const onName = step.id === 'name'
  const atEnd = index === last

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void finish(name)
  }

  return (
    <main className="welcome">
      <div className="welcome__card">
        <section className="welcome__copy" aria-label="Introduction to Droplet">
          <header className="welcome__header">
            <Wordmark link={false} />
            {!atEnd && (
              <button type="button" className="welcome__skip" onClick={() => (naming ? go(last) : void finish(''))} disabled={busy}>
                Skip intro
              </button>
            )}
          </header>

          <div className="welcome__body">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step.id}
                className="welcome__step"
                initial={{ opacity: 0, x: 18 * direction }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 * direction }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <StepCopy step={step} first={index === 0} />

                {onName && (
                  <form id={ids.form} className="welcome__form" onSubmit={submit} noValidate>
                    <label htmlFor={ids.name}>Project name</label>
                    <input
                      id={ids.name}
                      type="text"
                      value={name}
                      maxLength={MAX_PROJECT_NAME}
                      placeholder="Kindred Gifting"
                      autoComplete="off"
                      aria-describedby={problem ? ids.problem : undefined}
                      onChange={(event) => setName(event.target.value)}
                    />
                    <p className="welcome__problem" id={ids.problem} role="alert" hidden={problem === ''}>
                      {problem}
                    </p>
                    <button type="button" className="welcome__later" onClick={() => void finish('')} disabled={busy}>
                      Skip for now
                    </button>
                  </form>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className="welcome__footer">
            <nav className="welcome__dots" aria-label="Introduction steps">
              {steps.map((item, position) => (
                <button
                  key={item.id}
                  type="button"
                  className="welcome__dot"
                  aria-label={`${item.label}, step ${position + 1} of ${steps.length}`}
                  aria-current={position === index ? 'step' : undefined}
                  onClick={() => go(position)}
                />
              ))}
            </nav>

            <div className="welcome__buttons">
              {index > 0 && (
                <button type="button" className="welcome__back" onClick={() => go(index - 1)} disabled={busy}>
                  <AltArrowLeftIcon size={18} aria-hidden="true" />
                  Back
                </button>
              )}
              {onName ? (
                <button type="submit" form={ids.form} className="welcome__next" disabled={busy} aria-busy={busy}>
                  {busy ? 'One moment' : 'Start'}
                  {!busy && <ArrowRightIcon size={18} aria-hidden="true" />}
                </button>
              ) : atEnd ? (
                <button type="button" className="welcome__next" onClick={() => void finish('')} disabled={busy} aria-busy={busy}>
                  {busy ? 'One moment' : 'Back to Droplet'}
                </button>
              ) : (
                <button type="button" className="welcome__next" onClick={() => go(index + 1)}>
                  Next
                  <ArrowRightIcon size={18} aria-hidden="true" />
                </button>
              )}
            </div>
          </footer>
        </section>

        {/* The picture. Decoration: the words on the left say everything it says. */}
        <section className="welcome__stage" aria-hidden="true">
          <div className="welcome__wave" />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step.id}
              className="welcome__scene"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Scene id={step.id} name={name} />
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </main>
  )
}

// The words of one step. The title takes focus when the step changes (not on the first), so a screen reader starts reading the new step.
function StepCopy({ step, first }: { step: Step; first: boolean }) {
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!first) title.current?.focus()
  }, [first])

  return (
    <>
      <p className="welcome__label">{step.label}</p>
      <h1 className="welcome__title" ref={title} tabIndex={-1}>
        {step.title}
      </h1>
      {step.lead && <p className="welcome__lead">{step.lead}</p>}
      {step.points && (
        <ul className="welcome__points">
          {step.points.map((point, position) => {
            const PointIcon = POINT_ICONS[position % POINT_ICONS.length]
            return (
              <li key={point}>
                <span className="welcome__point-icon">
                  <PointIcon size={20} aria-hidden="true" />
                </span>
                {point}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
