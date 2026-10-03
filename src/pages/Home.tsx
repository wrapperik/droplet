import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { HamburgerMenuIcon } from '@solar-icons/react/linear'
import ChatThread, { type ThreadMessage } from '../components/ChatThread.tsx'
import IntentBar from '../components/IntentBar.tsx'
import PaletteWorkspace from '../components/PaletteWorkspace.tsx'
import Sidebar from '../components/Sidebar.tsx'
import Wordmark from '../components/Wordmark.tsx'
import { applyTurnActions } from '../compose/applyActions.ts'
import { starterBlocks } from '../compose/fallback.ts'
import { paletteSnapshotOf, snapshotOfState } from '../compose/snapshot.ts'
import { MAX_HISTORY_MESSAGES, type Task } from '../compose/spec.ts'
import { requestComposition } from '../lib/composeClient.ts'
import { exportBrandSheet } from '../lib/exportSheet.ts'
import type { Heights, Placement } from '../lib/gridLayout.ts'
import { mockProjects, mockUser } from '../lib/mockProjects.ts'
import { loadPalette } from '../lib/projectStore.ts'
import type { TaskId } from '../lib/tasks.ts'
import { docOf, isUnsaved, openWorkspace, reduce, type WorkspaceAction, type WorkspaceState } from '../lib/workspaceState.ts'
import './Home.css'

// What each task is called in a sentence. Only the brand task has a workspace so far.
const TASK_NAMES: Record<Exclude<Task, 'brand' | 'chat'>, string> = {
  ideation: 'business idea',
  logo: 'logo',
  invoice: 'invoice',
  correspondence: 'client email',
}

const notBuilt = (id: Exclude<TaskId, 'brand'>) =>
  `That is a ${TASK_NAMES[id]} task. I cannot build that workspace yet, but I can still talk it through with you. For now I can build colour palettes.`

const projectName = (id: string) => mockProjects.find((project) => project.id === id)?.name ?? ''

export default function Home() {
  const [currentProjectId, setCurrentProjectId] = useState(mockProjects[0].id)
  const [activeId, setActiveId] = useState('home')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  // The palette workspace, once there is one. The AI and the person both change it through `reduce`.
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null)
  const [composing, setComposing] = useState(false)
  const [thread, setThread] = useState<ThreadMessage[]>([])
  const nextMessageId = useRef(1)
  const busyRef = useRef(false)

  // The latest values, readable inside an async request without going stale.
  const workspaceRef = useRef<WorkspaceState | null>(null)
  const threadRef = useRef<ThreadMessage[]>([])
  // Where each component is drawn and how tall, reported by the grid, for moves relative to another component.
  const drawnRef = useRef<{ layout: Placement[]; heights: Heights }>({ layout: [], heights: {} })
  useEffect(() => {
    workspaceRef.current = workspace
    threadRef.current = thread
  })

  // Once a workspace exists the conversation moves to a side panel, beside it.
  const docked = workspace !== null

  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  const message = useCallback(
    (from: ThreadMessage['from'], text: string, pending = false): ThreadMessage => ({ id: nextMessageId.current++, from, text, pending }),
    [],
  )

  const dispatch = useCallback((action: WorkspaceAction) => setWorkspace((current) => (current ? reduce(current, action) : current)), [])

  // The side panel takes width, so the sidebar steps back to icons the first time. It can be opened again.
  const workspaceOpened = useCallback(() => setCollapsed(true), [])

  const submitIntent = useCallback(
    async (text: string) => {
      if (busyRef.current) return
      busyRef.current = true
      const pending = message('droplet', '', true)
      // The conversation so far, without the reply still being worked on.
      const history = threadRef.current
        .filter((item) => !item.pending && item.text)
        .slice(-MAX_HISTORY_MESSAGES)
        .map((item) => ({ role: item.from === 'you' ? ('founder' as const) : ('droplet' as const), text: item.text.slice(0, 800) }))
      setThread((current) => [...current, message('you', text), pending])
      setComposing(true)

      const saved = loadPalette(currentProjectId)
      const open = workspaceRef.current
      const result = await requestComposition({
        intent: text,
        ...(history.length > 0 ? { history } : {}),
        ...(open
          ? { workspace: snapshotOfState(open, drawnRef.current.layout.length > 0 ? drawnRef.current.layout : null, saved ? (isUnsaved(docOf(open), saved) ? 'unsaved' : 'saved') : 'none') }
          : {}),
        ...(saved ? { memory: paletteSnapshotOf(saved.blocks) } : {}),
      })

      let reply: string
      if (!result.ok) {
        reply = result.message
      } else {
        // Applied to the workspace as it is now, which may have changed while the model was thinking.
        const applied = applyTurnActions({
          base: workspaceRef.current,
          open: (blocks) => openWorkspace(blocks, saved),
          actions: result.turn.actions,
          env: drawnRef.current,
        })
        if (applied.state && applied.state !== workspaceRef.current) {
          setWorkspace(applied.state)
          if (applied.opened) workspaceOpened()
        }
        reply = result.note ? `${result.turn.message} ${result.note}` : result.turn.message
        if (applied.skipped.length > 0) {
          reply += ` I could not do everything: ${applied.skipped.map((skipped) => skipped.reason).join(' ')}`
        }
        if (applied.effects.includes('export') && applied.state) {
          const exported = await exportBrandSheet(docOf(applied.state).blocks, projectName(currentProjectId))
          if (!exported) reply += ' I could not make the brand sheet.'
        }
      }

      setThread((current) => current.map((item) => (item.id === pending.id ? { ...item, text: reply, pending: false } : item)))
      setComposing(false)
      busyRef.current = false
    },
    [currentProjectId, message, workspaceOpened],
  )

  // The familiar path: choosing a task opens its fixed layout without asking the model, the same layout the
  // composer falls back to. Tasks without a workspace say so.
  const chooseTask = useCallback(
    (id: TaskId) => {
      if (busyRef.current) return
      if (id === 'brand') {
        const saved = loadPalette(currentProjectId)
        setWorkspace(openWorkspace(saved?.blocks ?? starterBlocks(), saved))
        workspaceOpened()
        setThread((current) => [
          ...current,
          message('you', 'Build the brand'),
          message('droplet', saved ? 'I opened the brand workspace with the palette you saved.' : 'I opened the brand workspace with a starter palette. Describe your business and the feeling you want, and I will build one for you.'),
        ])
      } else {
        setThread((current) => [...current, message('you', TASK_LABELS[id]), message('droplet', notBuilt(id))])
      }
    },
    [currentProjectId, message, workspaceOpened],
  )

  // Another project has its own saved palette, so an open workspace is replaced by that project's.
  const selectProject = useCallback((id: string) => {
    setCurrentProjectId(id)
    setWorkspace((current) => {
      if (!current) return current
      const saved = loadPalette(id)
      return openWorkspace(saved?.blocks ?? starterBlocks(), saved)
    })
  }, [])

  const navigate = (id: string) => {
    setActiveId(id)
    setMobileOpen(false)
  }

  const bar = (isDocked: boolean) => <IntentBar docked={isDocked} busy={composing} onSubmitIntent={submitIntent} onChooseTask={chooseTask} />

  return (
    <div className={docked ? 'home home--docked' : 'home'}>
      <Sidebar
        projects={mockProjects}
        currentProjectId={currentProjectId}
        onSelectProject={selectProject}
        activeId={activeId}
        onNavigate={navigate}
        onChooseTask={chooseTask}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        mobileOpen={mobileOpen}
        userName={mockUser.name}
      />
      {mobileOpen && <div className="home__scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />}

      <div className="home__screen glass glass--strong">
        <header className="home__header">
          <div className="home__menu">
            <button
              type="button"
              className="home__menu-button"
              aria-label="Open sidebar"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <HamburgerMenuIcon size={22} aria-hidden="true" />
            </button>
          </div>
          <div className="home__brand">
            <Wordmark />
          </div>
        </header>

        <main className={docked ? 'home__canvas' : 'home__canvas home__canvas--chat'} aria-busy={composing}>
          <h1 className="visually-hidden">Home</h1>
          {/* Before there is a workspace, the whole screen is the conversation. Droplet answers like any assistant until it is asked to build something. */}
          {!docked && thread.length > 0 && (
            <div className="home__conversation">
              <ChatThread messages={thread} />
            </div>
          )}
          <AnimatePresence>
            {workspace && (
              <motion.div
                key="palette"
                className={composing ? 'home__component home__component--busy' : 'home__component'}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
              >
                <PaletteWorkspace
                  key={currentProjectId}
                  projectId={currentProjectId}
                  projectName={projectName(currentProjectId)}
                  state={workspace}
                  dispatch={dispatch}
                  onResolved={(layout, heights) => {
                    drawnRef.current = { layout, heights }
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {!docked && <footer className="home__footer">{bar(false)}</footer>}
      </div>

      {docked && (
        <motion.aside
          className="home__chat"
          aria-label="Conversation"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <ChatThread messages={thread} />
          {bar(true)}
        </motion.aside>
      )}
    </div>
  )
}

// The task menu's words, for the thread.
const TASK_LABELS: Record<TaskId, string> = {
  ideation: 'Shape the business idea',
  brand: 'Build the brand',
  logo: 'Get a logo',
  invoice: 'Make an invoice',
  correspondence: 'Write to a client',
}
