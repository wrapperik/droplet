import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { HamburgerMenuIcon } from '@solar-icons/react/linear'
import ChatThread, { type ThreadMessage } from '../components/ChatThread.tsx'
import IntentBar from '../components/IntentBar.tsx'
import LoaderPreview from '../components/LoaderPreview.tsx'
import InvoiceWorkspace from '../components/invoice/InvoiceWorkspace.tsx'
import PaletteWorkspace from '../components/PaletteWorkspace.tsx'
import Sidebar from '../components/Sidebar.tsx'
import Wordmark from '../components/Wordmark.tsx'
import { applyTurnActions } from '../compose/applyActions.ts'
import { starterBlocks } from '../compose/fallback.ts'
import { applyInvoiceTurnActions } from '../compose/invoiceActions.ts'
import { snapshotOfInvoice } from '../compose/invoiceSnapshot.ts'
import type { InvoiceTurnAction } from '../compose/invoiceSpec.ts'
import { founderTextOf } from '../compose/rules.ts'
import { paletteSnapshotOf, snapshotOfState } from '../compose/snapshot.ts'
import { MAX_HISTORY_MESSAGES, isInvoiceAction, routedTo, type Task, type TurnAction } from '../compose/spec.ts'
import { requestComposition } from '../lib/composeClient.ts'
import { exportBrandSheet } from '../lib/exportSheet.ts'
import type { Heights, Placement } from '../lib/gridLayout.ts'
import { mockProjects, mockUser } from '../lib/mockProjects.ts'
import { loadPalette } from '../lib/projectStore.ts'
import type { TaskId } from '../lib/tasks.ts'
import { todayIso } from '../lib/invoice.ts'
import { openInvoiceForProject } from '../lib/invoiceStore.ts'
import { loadMemory } from '../lib/memoryStore.ts'
import { reduceInvoice, type InvoiceAction, type InvoiceState } from '../lib/invoiceState.ts'
import { docOf, isUnsaved, openWorkspace, reduce, type WorkspaceAction, type WorkspaceState } from '../lib/workspaceState.ts'
import './Home.css'

// What each task is called in a sentence. Only the brand and invoice tasks have a workspace so far.
const TASK_NAMES: Record<Exclude<Task, 'brand' | 'invoice' | 'chat'>, string> = {
  ideation: 'business idea',
  logo: 'logo',
  correspondence: 'client email',
}

const notBuilt = (id: Exclude<TaskId, 'brand' | 'invoice'>) =>
  `That is a ${TASK_NAMES[id]} task. I cannot build that workspace yet, but I can still talk it through with you. For now I can build colour palettes, and you can make an invoice by hand.`

const projectName = (id: string) => mockProjects.find((project) => project.id === id)?.name ?? ''

export default function Home() {
  const [currentProjectId, setCurrentProjectId] = useState(mockProjects[0].id)
  const [activeId, setActiveId] = useState('home')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  // The palette workspace, once there is one. The AI and the person both change it through `reduce`.
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null)
  // The invoice workspace, once it has been opened. For now it is filled in by hand; the AI does not touch it yet.
  const [invoice, setInvoice] = useState<InvoiceState | null>(null)
  // Which workspace is on screen. Each keeps its own state while the other is shown.
  const [view, setView] = useState<'brand' | 'invoice'>('brand')
  const [composing, setComposing] = useState(false)
  // The two ends of the header, where the workspace puts its controls beside the logo.
  const [headerStart, setHeaderStart] = useState<HTMLElement | null>(null)
  const [headerEnd, setHeaderEnd] = useState<HTMLElement | null>(null)
  // Beneath the header, where the workspace puts its toolbar.
  const [shelfSlot, setShelfSlot] = useState<HTMLElement | null>(null)
  const [thread, setThread] = useState<ThreadMessage[]>([])
  const nextMessageId = useRef(1)
  const busyRef = useRef(false)

  // The latest values, readable inside an async request without going stale.
  const workspaceRef = useRef<WorkspaceState | null>(null)
  const invoiceRef = useRef<InvoiceState | null>(null)
  const viewRef = useRef<'brand' | 'invoice'>('brand')
  const threadRef = useRef<ThreadMessage[]>([])
  // Where each component is drawn and how tall, reported by the grid, for moves relative to another component.
  const drawnRef = useRef<{ layout: Placement[]; heights: Heights }>({ layout: [], heights: {} })
  useEffect(() => {
    workspaceRef.current = workspace
    invoiceRef.current = invoice
    viewRef.current = view
    threadRef.current = thread
  })

  // Once a workspace exists the conversation moves to a side panel, beside it.
  const docked = workspace !== null || invoice !== null
  const showInvoice = invoice !== null && (view === 'invoice' || workspace === null)

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
  const dispatchInvoice = useCallback((action: InvoiceAction) => setInvoice((current) => (current ? reduceInvoice(current, action) : current)), [])

  // The side panel takes width, so the sidebar steps back to icons the first time. It can be opened again.
  const workspaceOpened = useCallback(() => setCollapsed(true), [])

  // The workspace the composer works on is the one on screen: the invoice if that is what is shown, otherwise the palette.
  const onScreen = (): 'brand' | 'invoice' | undefined => {
    if (invoiceRef.current && (viewRef.current === 'invoice' || !workspaceRef.current)) return 'invoice'
    return workspaceRef.current ? 'brand' : undefined
  }

  // Opens a workspace and puts it on screen, for a reply that asks to be taken there. The refs are set at once, since the next
  // request is made before the screen has had a chance to catch up.
  const openWorkspaceFor = useCallback(
    (target: 'brand' | 'invoice') => {
      if (target === 'invoice') {
        if (!invoiceRef.current) {
          const opened = openInvoiceForProject(currentProjectId)
          invoiceRef.current = opened
          setInvoice(opened)
        }
      } else if (!workspaceRef.current) {
        const saved = loadPalette(currentProjectId)
        const opened = openWorkspace(saved?.blocks ?? starterBlocks(), saved)
        workspaceRef.current = opened
        setWorkspace(opened)
      }
      viewRef.current = target
      setView(target)
      workspaceOpened()
    },
    [currentProjectId, workspaceOpened],
  )

  // One question to the composer and what comes of it. If the composer says the request belongs to the other workspace, that one
  // is opened and the question is asked again, once, with it in front of the composer.
  const converse = useCallback(
    async (text: string, history: { role: 'founder' | 'droplet'; text: string }[], pendingId: number, routed: boolean) => {
      const view = onScreen()
      const saved = loadPalette(currentProjectId)
      const open = workspaceRef.current
      const invoiceOpen = invoiceRef.current
      const memory = loadMemory(currentProjectId)
      const result = await requestComposition({
        intent: text,
        ...(history.length > 0 ? { history } : {}),
        ...(view ? { view } : {}),
        ...(view === 'invoice' && invoiceOpen ? { invoice: snapshotOfInvoice(invoiceOpen, memory, todayIso()) } : {}),
        ...(view !== 'invoice' && open
          ? { workspace: snapshotOfState(open, drawnRef.current.layout.length > 0 ? drawnRef.current.layout : null, saved ? (isUnsaved(docOf(open), saved) ? 'unsaved' : 'saved') : 'none') }
          : {}),
        ...(saved ? { memory: paletteSnapshotOf(saved.blocks) } : {}),
      })

      const finish = (reply: string) => setThread((current) => current.map((item) => (item.id === pendingId ? { ...item, text: reply, pending: false } : item)))

      if (!result.ok) return finish(result.message)

      const target = routedTo(result.turn, view)
      if (target && !routed) {
        finish(result.note ? `${result.turn.message} ${result.note}` : result.turn.message)
        openWorkspaceFor(target)
        const next = message('droplet', '', true)
        setThread((current) => [...current, next])
        return converse(text, history, next.id, true)
      }

      let reply: string
      if (view === 'invoice' && invoiceOpen) {
        // Applied to the invoice as it is now, which may have changed while the composer was thinking.
        const base = invoiceRef.current ?? invoiceOpen
        const actions = result.turn.actions.filter((action): action is InvoiceTurnAction => isInvoiceAction(action) || action.type === 'undo' || action.type === 'redo')
        const applied = applyInvoiceTurnActions({
          base,
          actions,
          clients: memory.clients.map((client) => ({ name: client.client.name, client: client.client })),
          founderText: founderTextOf({ intent: text, history }),
        })
        if (applied.state !== base) {
          invoiceRef.current = applied.state
          setInvoice(applied.state)
        }
        reply = result.note ? `${result.turn.message} ${result.note}` : result.turn.message
        if (applied.skipped.length > 0) reply += ` I could not do everything: ${applied.skipped.map((skipped) => skipped.reason).join(' ')}`
      } else {
        // Applied to the workspace as it is now, which may have changed while the model was thinking.
        const applied = applyTurnActions({
          base: workspaceRef.current,
          open: (blocks) => openWorkspace(blocks, saved),
          actions: result.turn.actions.filter((action): action is TurnAction => !isInvoiceAction(action)),
          env: drawnRef.current,
        })
        if (applied.state && applied.state !== workspaceRef.current) {
          setWorkspace(applied.state)
          // The palette changed, so it is the one to look at.
          setView('brand')
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
      finish(reply)
    },
    // onScreen only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentProjectId, message, openWorkspaceFor, workspaceOpened],
  )

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
      try {
        await converse(text, history, pending.id, false)
      } finally {
        setComposing(false)
        busyRef.current = false
      }
    },
    [converse, message],
  )

  // The familiar path: choosing a task opens its fixed layout without asking the model, the same layout the
  // composer falls back to. Tasks without a workspace say so.
  const chooseTask = useCallback(
    (id: TaskId) => {
      if (busyRef.current) return
      if (id === 'brand') {
        setView('brand')
        if (workspaceRef.current) {
          setThread((current) => [...current, message('you', 'Build the brand'), message('droplet', 'Back in the brand workspace.')])
          return
        }
        const saved = loadPalette(currentProjectId)
        setWorkspace(openWorkspace(saved?.blocks ?? starterBlocks(), saved))
        workspaceOpened()
        setThread((current) => [
          ...current,
          message('you', 'Build the brand'),
          message('droplet', saved ? 'I opened the brand workspace with the palette you saved.' : 'I opened the brand workspace with a starter palette. Describe your business and the feeling you want, and I will build one for you.'),
        ])
      } else if (id === 'invoice') {
        setView('invoice')
        if (invoiceRef.current) {
          setThread((current) => [...current, message('you', 'Make an invoice'), message('droplet', 'Back in the invoice workspace.')])
          return
        }
        setInvoice(openInvoiceForProject(currentProjectId))
        workspaceOpened()
        setThread((current) => [
          ...current,
          message('you', 'Make an invoice'),
          message('droplet', 'I opened the invoice workspace. Add your business and your client in the toolbar, then the lines. Drag a tool down for all of its fields. I cannot fill the invoice in from a description yet.'),
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
    setInvoice((current) => (current ? openInvoiceForProject(id) : current))
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
          <div className="home__header-start">
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
            <div className="home__tools" ref={setHeaderStart} />
          </div>
          <div className="home__brand">
            <Wordmark />
          </div>
          <div className="home__header-end">
            <div className="home__tools" ref={setHeaderEnd} />
          </div>
        </header>
        <div className="home__shelf" ref={setShelfSlot} />

        <main className={docked ? 'home__canvas' : 'home__canvas home__canvas--chat'} aria-busy={composing}>
          <h1 className="visually-hidden">Home</h1>
          {/* TEMPORARY: a looping thinking animation, for feedback. Shown until the first message. */}
          {!docked && thread.length === 0 && <LoaderPreview />}
          {/* Before there is a workspace, the whole screen is the conversation. Droplet answers like any assistant until it is asked to build something. */}
          {!docked && thread.length > 0 && (
            <div className="home__conversation">
              <ChatThread messages={thread} />
            </div>
          )}
          {/* One workspace at a time: the one on screen leaves before the other arrives, so their toolbars and header controls never overlap. */}
          <AnimatePresence mode="wait">
            {workspace && !showInvoice && (
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
                  headerSlots={{ start: headerStart, end: headerEnd, shelf: shelfSlot }}
                  onResolved={(layout, heights) => {
                    drawnRef.current = { layout, heights }
                  }}
                />
              </motion.div>
            )}
            {invoice && showInvoice && (
              <motion.div
                key="invoice"
                className="home__component"
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
              >
                <InvoiceWorkspace
                  key={`${currentProjectId}:${invoice.history.present.invoiceId}`}
                  projectId={currentProjectId}
                  projectName={projectName(currentProjectId)}
                  state={invoice}
                  dispatch={dispatchInvoice}
                  onReplace={setInvoice}
                  headerSlots={{ start: headerStart, end: headerEnd, shelf: shelfSlot }}
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
