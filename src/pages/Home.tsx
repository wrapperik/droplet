import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { HamburgerMenuIcon } from '@solar-icons/react/linear'
import ChatBar from '../components/ChatBar.tsx'
import type { ChatEntry } from '../components/ChatList.tsx'
import type { BoardHandle } from '../components/board/BoardCanvas.tsx'
import BoardWorkspace from '../components/board/BoardWorkspace.tsx'
import ChatThread, { type ThreadAction, type ThreadMessage } from '../components/ChatThread.tsx'
import IntentBar from '../components/IntentBar.tsx'
import InvoiceWorkspace from '../components/invoice/InvoiceWorkspace.tsx'
import PaletteWorkspace from '../components/PaletteWorkspace.tsx'
import RippleGlow from '../components/RippleGlow.tsx'
import Sidebar from '../components/Sidebar.tsx'
import Wordmark from '../components/Wordmark.tsx'
import { applyTurnActions } from '../compose/applyActions.ts'
import { starterBlocks } from '../compose/fallback.ts'
import { applyBoardTurnActions } from '../compose/boardActions.ts'
import { snapshotOfBoard } from '../compose/boardSnapshot.ts'
import type { BoardTurnAction } from '../compose/boardSpec.ts'
import { applyInvoiceTurnActions } from '../compose/invoiceActions.ts'
import { snapshotOfInvoice } from '../compose/invoiceSnapshot.ts'
import type { InvoiceTurnAction } from '../compose/invoiceSpec.ts'
import { founderTextOf } from '../compose/rules.ts'
import { paletteSnapshotOf, snapshotOfState } from '../compose/snapshot.ts'
import { MAX_HISTORY_MESSAGES, isBoardAction, isInvoiceAction, routedTo, type TurnAction, type View } from '../compose/spec.ts'
import { useRipple } from '../hooks/useRipple.ts'
import { requestComposition } from '../lib/composeClient.ts'
import { chatTitle, cleanTitle, hasFounderMessage, loadChats, removeChat, saveChats, storableMessages, upsertChat, type StoredChat } from '../lib/chatStore.ts'
import { loadBoard, openBoardForProject, saveBoard } from '../lib/boardStore.ts'
import { docOf as boardDocOf, isBoardUnsaved, reduceBoard, type BoardAction, type BoardState } from '../lib/boardState.ts'
import { exportBrandSheet } from '../lib/exportSheet.ts'
import type { Heights, Placement } from '../lib/gridLayout.ts'
import { mockProjects, mockUser, type ProjectSummary } from '../lib/mockProjects.ts'
import { newId } from '../lib/ids.ts'
import { boardHasChanges, invoiceHasChanges, paletteHasChanges } from '../lib/leaveCheck.ts'
import { loadPalette, savePalette } from '../lib/projectStore.ts'
import { shownWorkspace, type WorkspaceView } from '../lib/shownWorkspace.ts'
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

type HomeProps = {
  // The founder's projects, the first of which opens. Without them, the three sample projects.
  projects?: ProjectSummary[]
  // Who is signed in.
  userName?: string
  // Opens the account page. Without it the sidebar's Account does nothing.
  onAccount?: () => void
  // Ends the session. Without it the sidebar's Sign out does nothing.
  onSignOut?: () => void
}

export default function Home({ projects = mockProjects, userName = mockUser.name, onAccount, onSignOut }: HomeProps) {
  const projectName = useCallback((id: string) => projects.find((project) => project.id === id)?.name ?? '', [projects])
  const [currentProjectId, setCurrentProjectId] = useState(projects[0].id)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  // The palette workspace, once there is one. The AI and the person both change it through `reduce`.
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null)
  // The invoice workspace, once it has been opened. For now it is filled in by hand; the AI does not touch it yet.
  const [invoice, setInvoice] = useState<InvoiceState | null>(null)
  // The board for shaping the business idea, once it has been opened. For now the composer does not see it.
  const [board, setBoard] = useState<BoardState | null>(null)
  // Which workspace is on screen. Each keeps its own state while another is shown.
  const [view, setView] = useState<WorkspaceView>('brand')
  const [composing, setComposing] = useState(false)
  // The two ends of the header, where the workspace puts its controls beside the logo.
  const [headerStart, setHeaderStart] = useState<HTMLElement | null>(null)
  const [headerEnd, setHeaderEnd] = useState<HTMLElement | null>(null)
  // Beneath the header, where the workspace puts its toolbar.
  const [shelfSlot, setShelfSlot] = useState<HTMLElement | null>(null)
  const [thread, setThread] = useState<ThreadMessage[]>([])
  // Which conversation this is, and the project's others that are kept (the open one is added to the list from the thread itself).
  const [chatId, setChatId] = useState(() => newId())
  const [chats, setChats] = useState<StoredChat[]>([])
  // Reads and writes of the saved conversations go one after another, so a save is never read past and two saves never cross, whatever
  // the storage is.
  const chatQueue = useRef<Promise<unknown>>(Promise.resolve())
  const enqueueChats = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = chatQueue.current.then(task, task)
    chatQueue.current = next.catch(() => undefined)
    return next
  }, [])
  // The project's saved conversations, for the list. Queued behind any save that is still on its way.
  const refreshChats = useCallback((projectId: string) => enqueueChats(async () => setChats(await loadChats(projectId))), [enqueueChats])
  useEffect(() => {
    void refreshChats(projects[0].id)
    // Only the project that opens first: another project's conversations are read when it is chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshChats])
  // The name the composer gave this conversation, or empty while it has none (the list then shows how the conversation began). Held in
  // a ref as well, so a request made straight after one that named the chat tells the composer its name.
  const [chatName, setChatName] = useState('')
  const chatNameRef = useRef('')
  const nameChat = useCallback((name: string) => {
    chatNameRef.current = name
    setChatName(name)
  }, [])
  const nextMessageId = useRef(1)
  // Asks the invoice workspace to open its note of what would be remembered, for the "save before you go" question in the chat.
  const [invoiceSaveSignal, setInvoiceSaveSignal] = useState(0)
  // The question about unsaved work that is open in the thread, if there is one: which message, and what is still unsaved.
  const leaveRef = useRef<{ id: number; brand: boolean; invoice: boolean; board: boolean } | null>(null)
  const busyRef = useRef(false)
  // Set while what was saved is being read to see whether leaving would lose anything.
  const checkingLeaveRef = useRef(false)
  // The header and toolbar, and how tall they are: a board that fills the screen is drawn under them and starts below.
  const topRef = useRef<HTMLDivElement>(null)
  const [topHeight, setTopHeight] = useState(0)
  useLayoutEffect(() => {
    const top = topRef.current
    if (!top) return
    const measure = () => setTopHeight(Math.round(top.getBoundingClientRect().height))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(top)
    return () => observer.disconnect()
  }, [])
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
  const boardRef = useRef<BoardState | null>(null)
  // What the board can be asked of, such as where the founder is looking, so the composer's notes go there.
  const boardHandleRef = useRef<BoardHandle | null>(null)
  const viewRef = useRef<WorkspaceView>('brand')
  const threadRef = useRef<ThreadMessage[]>([])
  // Where each component is drawn and how tall, reported by the grid, for moves relative to another component.
  const drawnRef = useRef<{ layout: Placement[]; heights: Heights }>({ layout: [], heights: {} })
  useEffect(() => {
    workspaceRef.current = workspace
    invoiceRef.current = invoice
    boardRef.current = board
    viewRef.current = view
    threadRef.current = thread
  })

  useRipple(canvasRef, composing)

  // Every conversation the founder has said something in is kept for the project, so they can come back to it. Nothing is written
  // for a conversation with no words from the founder, and nothing changes if what is kept is already what was said.
  useEffect(() => {
    const messages = storableMessages(thread)
    if (!hasFounderMessage(messages)) return
    const title = chatName || chatTitle(messages)
    void enqueueChats(async () => {
      const kept = await loadChats(currentProjectId)
      const there = kept.find((chat) => chat.id === chatId)
      if (there && there.title === title && JSON.stringify(there.messages) === JSON.stringify(messages)) return
      await saveChats(currentProjectId, upsertChat(kept, { id: chatId, title, ...(chatName ? { named: true } : {}), updatedAt: new Date().toISOString(), messages }))
    })
  }, [thread, chatId, chatName, currentProjectId, enqueueChats])

  // Once a workspace exists the conversation moves to a side panel, beside it.
  const docked = workspace !== null || invoice !== null || board !== null
  const shown = shownWorkspace({ brand: workspace !== null, invoice: invoice !== null, board: board !== null }, view)

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
  const dispatchBoard = useCallback((action: BoardAction) => setBoard((current) => (current ? reduceBoard(current, action) : current)), [])
  const dispatchInvoice = useCallback((action: InvoiceAction) => setInvoice((current) => (current ? reduceInvoice(current, action) : current)), [])

  // Whether the board has been saved, for what the composer is told.
  const boardSaveStatus = async (state: BoardState) => {
    const saved = await loadBoard(currentProjectId)
    return saved ? (isBoardUnsaved(boardDocOf(state), saved) ? ('unsaved' as const) : ('saved' as const)) : ('none' as const)
  }

  // The side panel takes width, so the sidebar steps back to icons the first time. It can be opened again.
  const workspaceOpened = useCallback(() => setCollapsed(true), [])

  // The workspace the composer works on is the one on screen: the palette, the invoice or the board.
  const onScreen = (): View | undefined => shownWorkspace({ brand: workspaceRef.current !== null, invoice: invoiceRef.current !== null, board: boardRef.current !== null }, viewRef.current) ?? undefined

  // Opens a workspace and puts it on screen, for a reply that asks to be taken there. The refs are set at once, since the next
  // request is made before the screen has had a chance to catch up.
  const openWorkspaceFor = useCallback(
    async (target: View) => {
      if (target === 'board') {
        if (!boardRef.current) {
          const opened = await openBoardForProject(currentProjectId)
          boardRef.current = opened
          setBoard(opened)
        }
      } else if (target === 'invoice') {
        if (!invoiceRef.current) {
          const opened = await openInvoiceForProject(currentProjectId)
          invoiceRef.current = opened
          setInvoice(opened)
        }
      } else if (!workspaceRef.current) {
        const saved = await loadPalette(currentProjectId)
        const opened = openWorkspace(saved?.blocks ?? starterBlocks(), saved)
        workspaceRef.current = opened
        setWorkspace(opened)
      }
      viewRef.current = target
      spaceRef.current = target === 'board' ? 'ideation' : target
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
      const [saved, memory] = await Promise.all([loadPalette(currentProjectId), loadMemory(currentProjectId)])
      const open = workspaceRef.current
      const invoiceOpen = invoiceRef.current
      const boardOpen = boardRef.current
      const boardStatus = view === 'board' && boardOpen ? await boardSaveStatus(boardOpen) : 'none'
      const result = await requestComposition({
        intent: text,
        ...(history.length > 0 ? { history } : {}),
        ...(view ? { view } : {}),
        ...(chatNameRef.current ? { chatTitle: chatNameRef.current } : {}),
        ...(view === 'invoice' && invoiceOpen ? { invoice: snapshotOfInvoice(invoiceOpen, memory, todayIso()) } : {}),
        ...(view === 'brand' && open
          ? { workspace: snapshotOfState(open, drawnRef.current.layout.length > 0 ? drawnRef.current.layout : null, saved ? (isUnsaved(docOf(open), saved) ? 'unsaved' : 'saved') : 'none') }
          : {}),
        ...(view === 'board' && boardOpen
          ? { board: snapshotOfBoard(boardOpen, boardHandleRef.current?.viewMiddle() ?? { x: 2400, y: 1600 }, boardStatus) }
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

      // The composer names the conversation once it has a subject, and may rename it if the subject changes.
      const named = result.turn.title ? cleanTitle(result.turn.title) : ''
      if (named) nameChat(named)

      const target = routedTo(result.turn, view)
      if (target && !routed) {
        // Taking the founder to another workspace: the next answer will carry the question, so this one has none.
        finish(paragraphs(result.turn.message, result.note))
        await openWorkspaceFor(target)
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
      } else if (view === 'board' && boardOpen) {
        // Applied to the board as it is now, which may have changed while the composer was thinking. The places are found here, in code, from the
        // board as it is, and never from the model.
        const base = boardRef.current ?? boardOpen
        const actions = result.turn.actions.filter((action): action is BoardTurnAction => isBoardAction(action) || action.type === 'undo' || action.type === 'redo')
        const applied = applyBoardTurnActions({ base, actions, view: boardHandleRef.current?.viewMiddle() ?? { x: 2400, y: 1600 } })
        if (applied.state !== base) {
          boardRef.current = applied.state
          setBoard(applied.state)
          // The first time the composer puts notes on the board, the founder is told what to do with them.
          const mine = (state: BoardState) => boardDocOf(state).items.filter((item) => item.kind === 'note' && item.author === 'ai').length
          if (mine(applied.state) > mine(base) && mine(base) === 0) notes.push('My notes are pink. Select one to keep it as yours, or delete it.')
        }
        if (applied.skipped.length > 0) notes.push(`I could not do everything: ${applied.skipped.map((skipped) => skipped.reason).join(' ')}`)
      } else {
        // Applied to the workspace as it is now, which may have changed while the model was thinking.
        const applied = applyTurnActions({
          base: workspaceRef.current,
          open: (blocks) => openWorkspace(blocks, saved),
          actions: result.turn.actions.filter((action): action is TurnAction => !isInvoiceAction(action) && !isBoardAction(action)),
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
    [currentProjectId, message, nameChat, openWorkspaceFor, projectName, workspaceOpened],
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
    async (id: TaskId) => {
      if (busyRef.current) return
      // Choosing a task says nothing in the thread. A divider marks the move once something is said in the new workspace.
      spaceRef.current = id
      // What was saved is read before the workspace opens. If the same task was chosen twice meanwhile, the first to arrive is the one opened.
      if (id === 'brand') {
        setView('brand')
        if (workspaceRef.current) return
        const saved = await loadPalette(currentProjectId)
        if (workspaceRef.current) return
        const opened = openWorkspace(saved?.blocks ?? starterBlocks(), saved)
        workspaceRef.current = opened
        setWorkspace(opened)
        workspaceOpened()
      } else if (id === 'invoice') {
        setView('invoice')
        if (invoiceRef.current) return
        const opened = await openInvoiceForProject(currentProjectId)
        if (invoiceRef.current) return
        invoiceRef.current = opened
        setInvoice(opened)
        workspaceOpened()
      } else if (id === 'ideation') {
        setView('board')
        if (boardRef.current) return
        const opened = await openBoardForProject(currentProjectId)
        if (boardRef.current) return
        boardRef.current = opened
        setBoard(opened)
        workspaceOpened()
      }
    },
    [currentProjectId, workspaceOpened],
  )

  // The conversations listed in the history: the open one first (once something has been said in it), then the project's others.
  const chatList: ChatEntry[] = (() => {
    const messages = storableMessages(thread)
    const open = hasFounderMessage(messages) ? [{ id: chatId, title: chatName || chatTitle(messages), current: true }] : []
    return [...open, ...chats.filter((chat) => chat.id !== chatId).map((chat) => ({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt, current: false }))]
  })()

  // A conversation begins with nothing said, in no workspace's name, and no question left open.
  const beginChat = useCallback((id: string, messages: ThreadMessage[], projectId: string, name = '') => {
    nameChat(name)
    leaveRef.current = null
    sentInRef.current = undefined
    nextMessageId.current = messages.reduce((highest, item) => Math.max(highest, item.id), 0) + 1
    void refreshChats(projectId)
    setChatId(id)
    setThread(messages)
  }, [nameChat, refreshChats])

  const newChat = useCallback(() => {
    if (!busyRef.current) beginChat(newId(), [], currentProjectId)
  }, [beginChat, currentProjectId])

  const openChat = useCallback(
    (id: string) => {
      if (busyRef.current) return
      // Read from what is saved, behind any save still on its way, so a conversation is opened as it was last kept.
      void enqueueChats(async () => {
        const chat = (await loadChats(currentProjectId)).find((entry) => entry.id === id)
        if (chat) beginChat(chat.id, chat.messages.map((item) => ({ ...item })), currentProjectId, chat.named ? chat.title : '')
      })
    },
    [beginChat, currentProjectId, enqueueChats],
  )

  const deleteChat = useCallback(
    (id: string) => {
      if (busyRef.current) return
      void enqueueChats(async () => {
        await saveChats(currentProjectId, removeChat(await loadChats(currentProjectId), id))
      })
      // Either way the list is read again, behind the delete.
      if (id === chatId) beginChat(newId(), [], currentProjectId)
      else void refreshChats(currentProjectId)
    },
    [beginChat, chatId, currentProjectId, enqueueChats, refreshChats],
  )

  // Both workspaces go, and the conversation has the whole screen again. What was saved stays; anything else is gone.
  const closeWorkspaces = useCallback(() => {
    workspaceRef.current = null
    invoiceRef.current = null
    boardRef.current = null
    viewRef.current = 'brand'
    spaceRef.current = null
    drawnRef.current = { layout: [], heights: {} }
    setWorkspace(null)
    setInvoice(null)
    setBoard(null)
    setView('brand')
    setCollapsed(false)
  }, [])

  // Settles the question about unsaved work: its buttons go, and it says how it ended.
  const settleLeave = useCallback((id: number, text: string, actions?: ThreadAction[]) => {
    if (!actions) leaveRef.current = null
    setThread((current) => current.map((item) => (item.id === id ? { ...item, text, actions } : item)))
  }, [])

  // The buttons that are still worth pressing, from what is still unsaved.
  const leaveActions = (left: { brand: boolean; invoice: boolean; board: boolean }): ThreadAction[] => [
    ...(left.brand ? [{ id: 'save-brand', label: 'Save the palette', primary: true }] : []),
    ...(left.board ? [{ id: 'save-board', label: 'Save the board', primary: true }] : []),
    ...(left.invoice ? [{ id: 'save-invoice', label: 'Review and save the invoice', primary: true }] : []),
    { id: 'leave', label: 'Leave without saving' },
    { id: 'stay', label: 'Keep working' },
  ]

  // Something was saved: if that was the last thing, the workspace closes, and if not, the question stays for what is left.
  const savedForLeave = useCallback(
    (what: string) => {
      const prompt = leaveRef.current
      if (!prompt) return
      if (!prompt.brand && !prompt.invoice && !prompt.board) {
        settleLeave(prompt.id, `${what} Everything is saved, so I closed the workspace.`)
        closeWorkspaces()
        return
      }
      const left = prompt.brand ? 'The palette' : prompt.board ? 'The board' : 'The invoice'
      settleLeave(prompt.id, `${what} ${left} still has unsaved changes. Save it as well, or leave without saving?`, leaveActions(prompt))
    },
    [closeWorkspaces, settleLeave],
  )

  // Back to the conversation as the whole screen. Closing a workspace loses what was not saved, so if there is any, Droplet asks first,
  // in the thread, with a button for each way out. Nothing is saved without the founder's say: the palette saves when its button is
  // pressed, and the invoice opens its note of what would be remembered, which the founder confirms.
  const backToChat = useCallback(async () => {
    if (busyRef.current || leaveRef.current || checkingLeaveRef.current) return
    // What was saved has to be read to know whether anything is unsaved, so a second press meanwhile is ignored.
    checkingLeaveRef.current = true
    let brand = false
    let invoiceChanged = false
    let boardChanged = false
    try {
      const [palette, memory, arrangement, board] = await Promise.all([loadPalette(currentProjectId), loadMemory(currentProjectId), loadInvoice(currentProjectId), loadBoard(currentProjectId)])
      brand = workspaceRef.current ? paletteHasChanges(workspaceRef.current, palette) : false
      invoiceChanged = invoiceRef.current ? invoiceHasChanges(invoiceRef.current, memory, arrangement) : false
      boardChanged = boardRef.current ? boardHasChanges(boardRef.current, board) : false
    } finally {
      checkingLeaveRef.current = false
    }
    if (!brand && !invoiceChanged && !boardChanged) {
      closeWorkspaces()
      return
    }
    const left = { brand, invoice: invoiceChanged, board: boardChanged }
    const where = [brand ? 'the brand palette' : null, boardChanged ? 'the board' : null, invoiceChanged ? 'the invoice' : null].filter(Boolean).join(' and ')
    const prompt: ThreadMessage = { ...message('droplet', `You have unsaved changes in ${where}. If I close the workspace now they are lost. Save first?`), local: true, actions: leaveActions(left) }
    leaveRef.current = { id: prompt.id, ...left }
    setThread((current) => [...current, prompt])
  }, [closeWorkspaces, currentProjectId, message])

  const onThreadAction = useCallback(
    async (messageId: number, actionId: string) => {
      const prompt = leaveRef.current
      if (!prompt || prompt.id !== messageId || busyRef.current) return
      if (actionId === 'stay') settleLeave(messageId, 'Okay, I left the workspace as it is.')
      else if (actionId === 'leave') {
        settleLeave(messageId, 'I closed the workspace without saving.')
        closeWorkspaces()
      } else if (actionId === 'save-brand' && workspaceRef.current) {
        const doc = docOf(workspaceRef.current)
        const result = await savePalette(currentProjectId, { blocks: doc.blocks, layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden })
        if (result === null) settleLeave(messageId, 'I could not save the palette, because it could not be stored.', leaveActions(prompt))
        else {
          prompt.brand = false
          savedForLeave('I saved the palette.')
        }
      } else if (actionId === 'save-board' && boardRef.current) {
        const doc = boardDocOf(boardRef.current)
        const result = await saveBoard(currentProjectId, { items: doc.items, layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden })
        if (result === null) settleLeave(messageId, 'I could not save the board, because it could not be stored.', leaveActions(prompt))
        else {
          prompt.board = false
          savedForLeave('I saved the board.')
        }
      } else if (actionId === 'save-invoice') {
        // The invoice has a note of its own, of exactly what would be remembered. It opens, and the founder confirms.
        setInvoiceSaveSignal((count) => count + 1)
      }
    },
    [closeWorkspaces, currentProjectId, savedForLeave, settleLeave],
  )

  // The founder confirmed what the invoice would remember. If that was the last unsaved thing in a question about leaving, it is done.
  const invoiceConfirmed = useCallback(async () => {
    const prompt = leaveRef.current
    if (!prompt?.invoice) return
    const [memory, arrangement] = await Promise.all([loadMemory(currentProjectId), loadInvoice(currentProjectId)])
    const still = invoiceRef.current ? invoiceHasChanges(invoiceRef.current, memory, arrangement) : false
    if (still) return
    prompt.invoice = false
    savedForLeave('I saved the invoice.')
  }, [currentProjectId, savedForLeave])

  // Another project has its own saved palette, so an open workspace is replaced by that project's.
  const selectProject = useCallback(
    async (id: string) => {
      // The other project's workspaces are read first, and everything changes together once they have arrived, so a workspace is never shown
      // with another project's name on it.
      const [nextInvoice, nextBoard, palette] = await Promise.all([
        invoiceRef.current ? openInvoiceForProject(id) : null,
        boardRef.current ? openBoardForProject(id) : null,
        workspaceRef.current ? loadPalette(id) : null,
      ])
      // Conversations belong to a project, so another project starts with a new one.
      if (id !== currentProjectId) beginChat(newId(), [], id)
      setCurrentProjectId(id)
      if (nextInvoice) {
        invoiceRef.current = nextInvoice
        setInvoice(nextInvoice)
      }
      if (nextBoard) {
        boardRef.current = nextBoard
        setBoard(nextBoard)
      }
      if (workspaceRef.current) {
        const opened = openWorkspace(palette?.blocks ?? starterBlocks(), palette)
        workspaceRef.current = opened
        setWorkspace(opened)
      }
    },
    [beginChat, currentProjectId],
  )

  // The tip that offers the workspace menu is for the very start, before the founder has said anything.
  const bar = (isDocked: boolean) => (
    <IntentBar docked={isDocked} busy={composing} showTip={!hasFounderMessage(thread)} onSubmitIntent={submitIntent} onChooseTask={chooseTask} />
  )
  const chatBar = (isDocked: boolean) => (
    <ChatBar onFullScreen={isDocked ? backToChat : undefined} busy={composing} />
  )

  return (
    <div className={docked ? 'home home--docked' : 'home'} data-start={(!docked && !hasFounderMessage(thread)) || undefined}>
      <Sidebar
        projects={projects}
        currentProjectId={currentProjectId}
        onSelectProject={selectProject}
        chats={chatList}
        onNewChat={() => {
          newChat()
          setMobileOpen(false)
        }}
        onOpenChat={(id) => {
          openChat(id)
          setMobileOpen(false)
        }}
        onDeleteChat={deleteChat}
        busy={composing}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        mobileOpen={mobileOpen}
        userName={userName}
        onAccount={onAccount}
        onSignOut={onSignOut}
      />
      {mobileOpen && <div className="home__scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />}

      <div className="home__screen glass glass--strong" data-immersive={(docked && shown === 'board') || undefined}>
        {/* Before anything has been said, a wave of blue behind the conversation. It fades out when the first message is sent. */}
        {!docked && (
          <div className="home__backdrop" data-gone={hasFounderMessage(thread) || undefined} aria-hidden="true">
            <div className="home__wave" />
          </div>
        )}
        {/* The header and the toolbar, together: over a board that fills the screen they are lit from below by a gradual blur. */}
        <div className="home__top" ref={topRef}>
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
        </div>

        <main ref={canvasRef} className={docked ? (shown === 'board' ? 'home__canvas home__canvas--board' : 'home__canvas') : 'home__canvas home__canvas--chat'} aria-busy={composing}>
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
            {workspace && shown === 'brand' && (
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
            {invoice && shown === 'invoice' && (
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
            {board && shown === 'board' && (
              <motion.div key="board" className="home__component home__component--board" exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                <BoardWorkspace
                  key={currentProjectId}
                  projectId={currentProjectId}
                  projectName={projectName(currentProjectId)}
                  state={board}
                  dispatch={dispatchBoard}
                  handleRef={boardHandleRef}
                  topInset={topHeight}
                  headerSlots={{ start: headerStart, end: headerEnd, shelf: shelfSlot }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {!docked && <footer className="home__footer">{bar(false)}</footer>}
        {/* The blue light that travels out from the middle of the canvas while Droplet works, with the ripple of the windows. */}
        <RippleGlow active={composing && docked} />
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
