import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { HamburgerMenuIcon } from '@solar-icons/react/linear'
import ChatBar, { type ChatEntry } from '../components/ChatBar.tsx'
import ChatThread, { type ThreadAction, type ThreadMessage } from '../components/ChatThread.tsx'
import IntentBar from '../components/IntentBar.tsx'
import InvoiceWorkspace from '../components/invoice/InvoiceWorkspace.tsx'
import PaletteWorkspace from '../components/PaletteWorkspace.tsx'
import RippleGlow from '../components/RippleGlow.tsx'
import Sidebar from '../components/Sidebar.tsx'
import Wordmark from '../components/Wordmark.tsx'
import { applyTurnActions } from '../compose/applyActions.ts'
import { starterBlocks } from '../compose/fallback.ts'
import { applyInvoiceTurnActions } from '../compose/invoiceActions.ts'
import { snapshotOfInvoice } from '../compose/invoiceSnapshot.ts'
import type { InvoiceTurnAction } from '../compose/invoiceSpec.ts'
import { founderTextOf } from '../compose/rules.ts'
import { paletteSnapshotOf, snapshotOfState } from '../compose/snapshot.ts'
import { MAX_HISTORY_MESSAGES, isInvoiceAction, routedTo, type TurnAction } from '../compose/spec.ts'
import { useRipple } from '../hooks/useRipple.ts'
import { requestComposition } from '../lib/composeClient.ts'
import { chatTitle, hasFounderMessage, loadChats, removeChat, saveChats, storableMessages, upsertChat, type StoredChat } from '../lib/chatStore.ts'
import { exportBrandSheet } from '../lib/exportSheet.ts'
import type { Heights, Placement } from '../lib/gridLayout.ts'
import { mockProjects, mockUser } from '../lib/mockProjects.ts'
import { newId } from '../lib/ids.ts'
import { invoiceHasChanges, paletteHasChanges } from '../lib/leaveCheck.ts'
import { loadPalette, savePalette } from '../lib/projectStore.ts'
import type { TaskId } from '../lib/tasks.ts'
import { todayIso } from '../lib/invoice.ts'
import { loadInvoice, openInvoiceForProject } from '../lib/invoiceStore.ts'
import { loadMemory } from '../lib/memoryStore.ts'
import { reduceInvoice, type InvoiceAction, type InvoiceState } from '../lib/invoiceState.ts'
import { docOf, isUnsaved, openWorkspace, reduce, type WorkspaceAction, type WorkspaceState } from '../lib/workspaceState.ts'
import './Home.css'

// What each workspace is called in the divider that marks a move to it.
const SPACE_NAMES: Record<TaskId, string> = {
  ideation: 'Business idea',
  brand: 'Brand',
  logo: 'Logo',
  invoice: 'Invoice',
  correspondence: 'Client email',
}

// Parts of a reply, each its own paragraph. A part that is not there is left out.
const paragraphs = (...parts: (string | undefined)[]) => parts.filter((part) => part && part.trim() !== '').join('\n\n')

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
  // Which conversation this is, and the project's others that are kept (the open one is added to the list from the thread itself).
  const [chatId, setChatId] = useState(() => newId())
  const [chats, setChats] = useState<StoredChat[]>(() => loadChats(mockProjects[0].id))
  const nextMessageId = useRef(1)
  // Asks the invoice workspace to open its note of what would be remembered, for the "save before you go" question in the chat.
  const [invoiceSaveSignal, setInvoiceSaveSignal] = useState(0)
  // The question about unsaved work that is open in the thread, if there is one: which message, and what is still unsaved.
  const leaveRef = useRef<{ id: number; brand: boolean; invoice: boolean } | null>(null)
  const busyRef = useRef(false)
  // Which workspace the founder is in, from the task menu or because the composer took them there. And which one the last message
  // was sent in (undefined until one is sent), so a divider marks a move only once a message follows it, never for a move that was
  // made and left again without a word.
  const spaceRef = useRef<TaskId | null>(null)
  const sentInRef = useRef<TaskId | null | undefined>(undefined)
  // The canvas, whose windows ripple while Droplet works.
  const canvasRef = useRef<HTMLElement>(null)

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

  useRipple(canvasRef, composing)

  // Every conversation the founder has said something in is kept for the project, so they can come back to it. Nothing is written
  // for a conversation with no words from the founder, and nothing changes if what is kept is already what was said.
  useEffect(() => {
    const messages = storableMessages(thread)
    if (!hasFounderMessage(messages)) return
    const kept = loadChats(currentProjectId)
    const there = kept.find((chat) => chat.id === chatId)
    if (there && JSON.stringify(there.messages) === JSON.stringify(messages)) return
    saveChats(currentProjectId, upsertChat(kept, { id: chatId, title: chatTitle(messages), updatedAt: new Date().toISOString(), messages }))
  }, [thread, chatId, currentProjectId])

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
      spaceRef.current = target
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

      // The reply goes into the message that was pending. Droplet's question and the answers it suggests sit apart from the text, so
      // notes from the app land between the answer and the question, and the question stays last.
      const finish = (reply: string, turn?: { question?: string; replies?: string[] }) =>
        setThread((current) =>
          current.map((item) =>
            item.id === pendingId
              ? {
                  ...item,
                  text: reply,
                  pending: false,
                  ...(turn?.question ? { question: turn.question, ...(turn.replies && turn.replies.length > 0 ? { replies: turn.replies } : {}) } : {}),
                }
              : item,
          ),
        )

      if (!result.ok) return finish(result.message)

      const target = routedTo(result.turn, view)
      if (target && !routed) {
        // Taking the founder to another workspace: the next answer will carry the question, so this one has none.
        finish(paragraphs(result.turn.message, result.note))
        openWorkspaceFor(target)
        const next = message('droplet', '', true)
        setThread((current) => [...current, next])
        return converse(text, history, next.id, true)
      }

      // What the app adds to the model's own words, each as a paragraph of its own.
      const notes: (string | undefined)[] = [result.note]
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
        if (applied.skipped.length > 0) notes.push(`I could not do everything: ${applied.skipped.map((skipped) => skipped.reason).join(' ')}`)
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
          spaceRef.current = 'brand'
          if (applied.opened) workspaceOpened()
        }
        if (applied.skipped.length > 0) {
          notes.push(`I could not do everything: ${applied.skipped.map((skipped) => skipped.reason).join(' ')}`)
        }
        if (applied.effects.includes('export') && applied.state) {
          const exported = await exportBrandSheet(docOf(applied.state).blocks, projectName(currentProjectId))
          if (!exported) notes.push('I could not make the brand sheet.')
        }
      }
      finish(paragraphs(result.turn.message, ...notes), result.turn)
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
        .filter((item) => item.from !== 'divider' && !item.local && !item.pending && item.text)
        .slice(-MAX_HISTORY_MESSAGES)
        .map((item) => ({ role: item.from === 'you' ? ('founder' as const) : ('droplet' as const), text: paragraphs(item.text, item.question).slice(0, 1500) }))
      // A move to another workspace is marked once, here, when something is said in it.
      const space = spaceRef.current
      const moved = space !== null && sentInRef.current !== undefined && sentInRef.current !== space
      sentInRef.current = space
      setThread((current) => [...current, ...(moved ? [message('divider', `Switched workspace to ${SPACE_NAMES[space]}`)] : []), message('you', text), pending])
      setComposing(true)
      try {
        await converse(text, history, pending.id, false)
        // If the composer took the founder to another workspace, that is where they are now, and no divider is owed for it.
        sentInRef.current = spaceRef.current
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
      // Choosing a task says nothing in the thread. A divider marks the move once something is said in the new workspace.
      spaceRef.current = id
      if (id === 'brand') {
        setView('brand')
        if (workspaceRef.current) return
        const saved = loadPalette(currentProjectId)
        setWorkspace(openWorkspace(saved?.blocks ?? starterBlocks(), saved))
        workspaceOpened()
      } else if (id === 'invoice') {
        setView('invoice')
        if (invoiceRef.current) return
        setInvoice(openInvoiceForProject(currentProjectId))
        workspaceOpened()
      }
    },
    [currentProjectId, workspaceOpened],
  )

  // The conversations listed in the history: the open one first (once something has been said in it), then the project's others.
  const chatList: ChatEntry[] = (() => {
    const messages = storableMessages(thread)
    const open = hasFounderMessage(messages) ? [{ id: chatId, title: chatTitle(messages), current: true }] : []
    return [...open, ...chats.filter((chat) => chat.id !== chatId).map((chat) => ({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt, current: false }))]
  })()

  // A conversation begins with nothing said, in no workspace's name, and no question left open.
  const beginChat = useCallback((id: string, messages: ThreadMessage[], projectId: string) => {
    leaveRef.current = null
    sentInRef.current = undefined
    nextMessageId.current = messages.reduce((highest, item) => Math.max(highest, item.id), 0) + 1
    setChats(loadChats(projectId))
    setChatId(id)
    setThread(messages)
  }, [])

  const newChat = useCallback(() => {
    if (!busyRef.current) beginChat(newId(), [], currentProjectId)
  }, [beginChat, currentProjectId])

  const openChat = useCallback(
    (id: string) => {
      if (busyRef.current) return
      const chat = loadChats(currentProjectId).find((entry) => entry.id === id)
      if (chat) beginChat(chat.id, chat.messages.map((item) => ({ ...item })), currentProjectId)
    },
    [beginChat, currentProjectId],
  )

  const deleteChat = useCallback(
    (id: string) => {
      if (busyRef.current) return
      saveChats(currentProjectId, removeChat(loadChats(currentProjectId), id))
      if (id === chatId) beginChat(newId(), [], currentProjectId)
      else setChats(loadChats(currentProjectId))
    },
    [beginChat, chatId, currentProjectId],
  )

  // Both workspaces go, and the conversation has the whole screen again. What was saved stays; anything else is gone.
  const closeWorkspaces = useCallback(() => {
    workspaceRef.current = null
    invoiceRef.current = null
    viewRef.current = 'brand'
    spaceRef.current = null
    drawnRef.current = { layout: [], heights: {} }
    setWorkspace(null)
    setInvoice(null)
    setView('brand')
    setCollapsed(false)
  }, [])

  // Settles the question about unsaved work: its buttons go, and it says how it ended.
  const settleLeave = useCallback((id: number, text: string, actions?: ThreadAction[]) => {
    if (!actions) leaveRef.current = null
    setThread((current) => current.map((item) => (item.id === id ? { ...item, text, actions } : item)))
  }, [])

  // The buttons that are still worth pressing, from what is still unsaved.
  const leaveActions = (left: { brand: boolean; invoice: boolean }): ThreadAction[] => [
    ...(left.brand ? [{ id: 'save-brand', label: 'Save the palette', primary: true }] : []),
    ...(left.invoice ? [{ id: 'save-invoice', label: 'Review and save the invoice', primary: true }] : []),
    { id: 'leave', label: 'Leave without saving' },
    { id: 'stay', label: 'Keep working' },
  ]

  // Something was saved: if that was the last thing, the workspace closes, and if not, the question stays for what is left.
  const savedForLeave = useCallback(
    (what: string) => {
      const prompt = leaveRef.current
      if (!prompt) return
      if (!prompt.brand && !prompt.invoice) {
        settleLeave(prompt.id, `${what} Everything is saved, so I closed the workspace.`)
        closeWorkspaces()
        return
      }
      settleLeave(prompt.id, `${what} ${prompt.brand ? 'The palette' : 'The invoice'} still has unsaved changes. Save it as well, or leave without saving?`, leaveActions(prompt))
    },
    [closeWorkspaces, settleLeave],
  )

  // Back to the conversation as the whole screen. Closing a workspace loses what was not saved, so if there is any, Droplet asks first,
  // in the thread, with a button for each way out. Nothing is saved without the founder's say: the palette saves when its button is
  // pressed, and the invoice opens its note of what would be remembered, which the founder confirms.
  const backToChat = useCallback(() => {
    if (busyRef.current || leaveRef.current) return
    const brand = workspaceRef.current ? paletteHasChanges(workspaceRef.current, loadPalette(currentProjectId)) : false
    const invoiceChanged = invoiceRef.current ? invoiceHasChanges(invoiceRef.current, loadMemory(currentProjectId), loadInvoice(currentProjectId)) : false
    if (!brand && !invoiceChanged) {
      closeWorkspaces()
      return
    }
    const left = { brand, invoice: invoiceChanged }
    const where = [brand ? 'the brand palette' : null, invoiceChanged ? 'the invoice' : null].filter(Boolean).join(' and ')
    const prompt: ThreadMessage = { ...message('droplet', `You have unsaved changes in ${where}. If I close the workspace now they are lost. Save first?`), local: true, actions: leaveActions(left) }
    leaveRef.current = { id: prompt.id, ...left }
    setThread((current) => [...current, prompt])
  }, [closeWorkspaces, currentProjectId, message])

  const onThreadAction = useCallback(
    (messageId: number, actionId: string) => {
      const prompt = leaveRef.current
      if (!prompt || prompt.id !== messageId || busyRef.current) return
      if (actionId === 'stay') settleLeave(messageId, 'Okay, I left the workspace as it is.')
      else if (actionId === 'leave') {
        settleLeave(messageId, 'I closed the workspace without saving.')
        closeWorkspaces()
      } else if (actionId === 'save-brand' && workspaceRef.current) {
        const doc = docOf(workspaceRef.current)
        const result = savePalette(currentProjectId, { blocks: doc.blocks, layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden })
        if (result === null) settleLeave(messageId, 'I could not save the palette, because the browser would not store it.', leaveActions(prompt))
        else {
          prompt.brand = false
          savedForLeave('I saved the palette.')
        }
      } else if (actionId === 'save-invoice') {
        // The invoice has a note of its own, of exactly what would be remembered. It opens, and the founder confirms.
        setInvoiceSaveSignal((count) => count + 1)
      }
    },
    [closeWorkspaces, currentProjectId, savedForLeave, settleLeave],
  )

  // The founder confirmed what the invoice would remember. If that was the last unsaved thing in a question about leaving, it is done.
  const invoiceConfirmed = useCallback(() => {
    const prompt = leaveRef.current
    if (!prompt?.invoice) return
    const still = invoiceRef.current ? invoiceHasChanges(invoiceRef.current, loadMemory(currentProjectId), loadInvoice(currentProjectId)) : false
    if (still) return
    prompt.invoice = false
    savedForLeave('I saved the invoice.')
  }, [currentProjectId, savedForLeave])

  // Another project has its own saved palette, so an open workspace is replaced by that project's.
  const selectProject = useCallback(
    (id: string) => {
    // Conversations belong to a project, so another project starts with a new one.
    if (id !== currentProjectId) beginChat(newId(), [], id)
    setCurrentProjectId(id)
    setInvoice((current) => (current ? openInvoiceForProject(id) : current))
    setWorkspace((current) => {
      if (!current) return current
      const saved = loadPalette(id)
      return openWorkspace(saved?.blocks ?? starterBlocks(), saved)
    })
    },
    [beginChat, currentProjectId],
  )

  const navigate = (id: string) => {
    setActiveId(id)
    setMobileOpen(false)
  }

  // The tip that offers the workspace menu is for the very start, before the founder has said anything.
  const bar = (isDocked: boolean) => (
    <IntentBar docked={isDocked} busy={composing} showTip={!hasFounderMessage(thread)} onSubmitIntent={submitIntent} onChooseTask={chooseTask} />
  )
  const chatBar = (isDocked: boolean) => (
    <ChatBar chats={chatList} onOpen={openChat} onNew={newChat} onDelete={deleteChat} onFullScreen={isDocked ? backToChat : undefined} busy={composing} />
  )

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
        {/* Before anything has been said, a wave of blue behind the conversation. It fades out when the first message is sent. */}
        {!docked && (
          <div className="home__backdrop" data-gone={hasFounderMessage(thread) || undefined} aria-hidden="true">
            <div className="home__wave" />
          </div>
        )}
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

        <main ref={canvasRef} className={docked ? 'home__canvas' : 'home__canvas home__canvas--chat'} aria-busy={composing}>
          <h1 className="visually-hidden">Home</h1>
          {/* Before there is a workspace, the whole screen is the conversation. Droplet answers like any assistant until it is asked to build something. */}
          {!docked && (
            <div className="home__conversation">
              {chatBar(false)}
              <ChatThread messages={thread} onAction={onThreadAction} onReply={submitIntent} />
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
                className={composing ? 'home__component home__component--busy' : 'home__component'}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
              >
                <InvoiceWorkspace
                  key={`${currentProjectId}:${invoice.history.present.invoiceId}`}
                  projectId={currentProjectId}
                  projectName={projectName(currentProjectId)}
                  state={invoice}
                  dispatch={dispatchInvoice}
                  onReplace={setInvoice}
                  saveSignal={invoiceSaveSignal}
                  onConfirmed={invoiceConfirmed}
                  headerSlots={{ start: headerStart, end: headerEnd, shelf: shelfSlot }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {!docked && <footer className="home__footer">{bar(false)}</footer>}
        {/* The blue light that travels out from the middle of the canvas while Droplet works, with the ripple of the windows. */}
        <RippleGlow active={composing} />
      </div>

      {docked && (
        <motion.aside
          className="home__chat"
          aria-label="Conversation"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          {chatBar(true)}
          <ChatThread messages={thread} onAction={onThreadAction} onReply={submitIntent} />
          {bar(true)}
        </motion.aside>
      )}
    </div>
  )
}
