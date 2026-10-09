import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { HamburgerMenuIcon } from '@solar-icons/react/linear'
import ChatBar from '../components/ChatBar.tsx'
import ChatGlow from '../components/ChatGlow.tsx'
import type { FlightOrigin } from '../components/FlyingMessage.tsx'
import { FLIGHT_MS } from '../lib/flight.ts'
import ChatGreeting from '../components/ChatGreeting.tsx'
import type { ChatEntry } from '../components/ChatList.tsx'
import type { BoardHandle } from '../components/board/BoardCanvas.tsx'
import BoardWorkspace from '../components/board/BoardWorkspace.tsx'
import ChatThread, { type ThreadAction, type ThreadMessage } from '../components/ChatThread.tsx'
import IntentBar from '../components/IntentBar.tsx'
import Library from '../components/Library.tsx'
import InvoiceWorkspace from '../components/invoice/InvoiceWorkspace.tsx'
import GuidedInvoice from '../components/invoice/GuidedInvoice.tsx'
import InvoiceResultCard from '../components/InvoiceResultCard.tsx'
import { GUIDE_STEPS, jumpTo, progressFor, resultMessage, stepIndex, type GuideProgress, type InvoiceResult } from '../lib/invoiceGuide.ts'
import { useWorkMode } from '../store/workMode.ts'
import PaletteWorkspace from '../components/PaletteWorkspace.tsx'
import RippleGlow from '../components/RippleGlow.tsx'
import Sidebar from '../components/Sidebar.tsx'
import Wordmark from '../components/Wordmark.tsx'
import { applyTurnActions } from '../compose/applyActions.ts'
import { buildReceipt, focusOf, type Change, type FocusTarget, type Receipt, type ReceiptWorkspace } from '../compose/receipt.ts'
import { prepareArrival, revealTargets, type Arrival } from '../lib/arrival.ts'
import type { ProposalView } from '../components/FactChips.tsx'
import ProjectBrief from '../components/ProjectBrief.tsx'
import Toast, { type ToastMessage } from '../components/Toast.tsx'
import { factLabel, factText, type FactKey } from '../lib/facts.ts'
import { describeBlocks, type ChatBlock } from '../compose/blocks.ts'
import type { Grounding } from '../compose/grounding.ts'
import { doneSteps, OPEN_PHRASE, STEP_WORKSPACE, workspaceForPhrase, type JourneyStep, type ProjectSnapshot } from '../compose/journey.ts'
import { snapshotOfProject } from '../compose/project.ts'
import { starterBlocks } from '../compose/fallback.ts'
import { applyBoardTurnActions } from '../compose/boardActions.ts'
import { snapshotOfBoard } from '../compose/boardSnapshot.ts'
import type { BoardTurnAction } from '../compose/boardSpec.ts'
import { applyInvoiceTurnActions } from '../compose/invoiceActions.ts'
import { snapshotOfInvoice } from '../compose/invoiceSnapshot.ts'
import type { InvoiceTurnAction } from '../compose/invoiceSpec.ts'
import { founderTextOf } from '../compose/rules.ts'
import { paletteSnapshotOf, snapshotOfState } from '../compose/snapshot.ts'
import { MAX_HISTORY_MESSAGES, isBoardAction, isInvoiceAction, isScreenAction, routedTo, type Mode, type PaletteAction, type View } from '../compose/spec.ts'
import { useRipple } from '../hooks/useRipple.ts'
import { requestComposition, requestSummary } from '../lib/composeClient.ts'
import { useAdvancedAllowance } from '../lib/advancedAllowance.ts'
import { byPinnedThenRecent, chatHasBegun, chatTitle, cleanTitle, hasFounderMessage, lastActive, loadChats, pinChat, removeChat, saveChats, storableMessages, upsertChat, type StoredChat } from '../lib/chatStore.ts'
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
import { duplicateInvoice, loadInvoice, openInvoiceForProject, openNewInvoice, openSavedInvoice } from '../lib/invoiceStore.ts'
import { exportLibraryItem, type ExportTarget, type OpenTarget } from '../lib/libraryActions.ts'
import { findInvoice, libraryOf, type InvoiceItem } from '../lib/library.ts'
import { snapshotOfLibrary } from '../compose/librarySnapshot.ts'
import { loadMemory, saveMemory } from '../lib/memoryStore.ts'
import { currentFacts, factStatus, forgetFact, settingOn, withFact } from '../lib/projectMemory.ts'
import { MAX_CHAT_MESSAGES } from '../compose/background.ts'
import type { Task } from '../compose/taskNames.ts'
import { needsSummary, selectEarlierChats } from '../lib/recall.ts'
import { keepNotes } from '../lib/notesKeeper.ts'
import { loadNotes } from '../lib/notesStore.ts'
import { notesForRequest } from '../lib/notes.ts'
import { onDocumentSaved } from '../lib/storage.ts'
import { invoiceDocOf, reduceInvoice, type InvoiceAction, type InvoiceState } from '../lib/invoiceState.ts'
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

// The task a workspace is for, so a memory of a chat about the same task is picked first.
const TASK_OF_VIEW: Record<View, Task> = { brand: 'brand', invoice: 'invoice', board: 'ideation' }

// What a reply changed, kept for this session so Undo this can take it back and Show me can find it again.
type LiveReceipt = { workspace: ReceiptWorkspace; after: unknown; targets: FocusTarget[]; undoable: boolean }

export default function Home({ projects = mockProjects, userName = mockUser.name, onAccount, onSignOut }: HomeProps) {
  const projectName = useCallback((id: string) => projects.find((project) => project.id === id)?.name ?? '', [projects])
  const [currentProjectId, setCurrentProjectId] = useState(projects[0].id)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  // The palette workspace, once there is one. The AI and the person both change it through `reduce`.
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null)
  // The invoice workspace, once it has been opened. The founder and the composer both change it through `reduceInvoice`.
  const [invoice, setInvoice] = useState<InvoiceState | null>(null)
  // The board for shaping the business idea, once it has been opened. The founder and the composer both change it through `reduceBoard`.
  const [board, setBoard] = useState<BoardState | null>(null)
  // Guide or Workspace, as the founder chose in the menu beside the message box. In Guide mode the invoice is shown one step at a time.
  const workMode = useWorkMode((state) => state.mode)
  // Where the founder is in the guided invoice. Kept here, so a visit to another workspace does not lose the place.
  const [guide, setGuide] = useState<GuideProgress | null>(null)
  const guideRef = useRef<GuideProgress | null>(null)
  // Which workspace is on screen. Each keeps its own state while another is shown.
  const [view, setView] = useState<WorkspaceView>('brand')
  // The library is shown in place of the workspaces, which keep their state while it is. Opening a workspace from it, or by asking, closes it.
  const [libraryOpen, setLibraryOpen] = useState(false)
  // Bumped when something outside the library changed what it lists, so it reads again.
  const [libraryVersion, setLibraryVersion] = useState(0)
  const [composing, setComposing] = useState(false)
  // Where the founder's Advanced allowance stands, as the server last said.
  const [allowance, setAllowance] = useAdvancedAllowance()
  // The two ends of the header, where the workspace puts its controls beside the logo.
  const [headerStart, setHeaderStart] = useState<HTMLElement | null>(null)
  const [headerEnd, setHeaderEnd] = useState<HTMLElement | null>(null)
  // Beneath the header, where the workspace puts its toolbar.
  const [shelfSlot, setShelfSlot] = useState<HTMLElement | null>(null)
  const [thread, setThread] = useState<ThreadMessage[]>([])
  // Where the project is on the journey, from what it holds, so a plan in the chat can tick the steps that are done.
  const [projectInfo, setProjectInfo] = useState<ProjectSnapshot | undefined>(undefined)
  const doneSet = useMemo(() => doneSteps(projectInfo), [projectInfo])
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
  // The message that is on its way from the bar to the thread, if one is, and where it started.
  const [flight, setFlight] = useState<{ id: number; from: FlightOrigin } | null>(null)
  // However the flight goes (the thread it was in went away meanwhile, say), it is cleared a little after it should have ended, so it never starts again.
  useEffect(() => {
    if (!flight) return
    const timer = window.setTimeout(() => setFlight(null), FLIGHT_MS + 800)
    return () => window.clearTimeout(timer)
  }, [flight])
  // What the project holds: the saved palette, what the project remembers and the saved board. Used for what the composer is told and for
  // the ticks on a plan.
  const readProject = useCallback(
    async (projectId: string) => {
      const [palette, memory, board] = await Promise.all([loadPalette(projectId), loadMemory(projectId), loadBoard(projectId)])
      return snapshotOfProject({ projectName: projectName(projectId), memory, hasPalette: palette !== null, boardItems: board?.items.length ?? 0 })
    },
    [projectName],
  )
  const currentProjectRef = useRef(currentProjectId)
  useEffect(() => {
    currentProjectRef.current = currentProjectId
  })
  // Read again, so a palette saved or an invoice confirmed in a workspace shows as a tick in a plan. A project changed meanwhile is ignored.
  const refreshProject = useCallback(async () => {
    const id = currentProjectRef.current
    const info = await readProject(id)
    if (currentProjectRef.current === id) setProjectInfo((current) => (JSON.stringify(current) === JSON.stringify(info) ? current : info))
  }, [readProject])
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
  const libraryOpenRef = useRef(false)
  const threadRef = useRef<ThreadMessage[]>([])
  // Facts the founder pressed Not now on, by chat and key: not offered again in that chat.
  const dismissedFactsRef = useRef(new Set<string>())
  // The id of the open chat, readable inside an async request.
  const chatIdRef = useRef('')
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const toastId = useRef(0)
  const [briefOpen, setBriefOpen] = useState(false)
  // What a reply changed, for Undo this and Show me, by the message that carries its receipt. Only for this session: nothing here is saved.
  const receiptsRef = useRef(new Map<number, LiveReceipt>())
  // The arrival of what a reply changed, prepared before the screen changes and played once it has.
  const arrivalRef = useRef<Arrival | null>(null)
  // The leave check, for a reply that closes the workspace. It is defined after the request that calls it.
  const leaveWorkspacesRef = useRef<() => Promise<void>>(async () => undefined)
  // Opens something from the library, for a reply that asks to. It is defined after the request that calls it.
  const openFromLibraryRef = useRef<(target: OpenTarget) => Promise<'done' | 'unsaved'>>(async () => 'done')
  // Where each component is drawn and how tall, reported by the grid, for moves relative to another component.
  const drawnRef = useRef<{ layout: Placement[]; heights: Heights }>({ layout: [], heights: {} })
  useEffect(() => {
    workspaceRef.current = workspace
    invoiceRef.current = invoice
    boardRef.current = board
    viewRef.current = view
    libraryOpenRef.current = libraryOpen
    threadRef.current = thread
    leaveWorkspacesRef.current = leaveWorkspaces
    openFromLibraryRef.current = openFromLibrary
    chatIdRef.current = chatId
    guideRef.current = guide
  })

  useRipple(canvasRef, composing)

  // What a reply changed arrives in order once the screen has changed. Prepared before, played now, once.
  useLayoutEffect(() => {
    const arrival = arrivalRef.current
    arrivalRef.current = null
    arrival?.play()
  })

  // Every conversation the founder has said something in is kept for the project, so they can come back to it. Nothing is written
  // for a conversation with no words from the founder, and nothing changes if what is kept is already what was said.
  useEffect(() => {
    const messages = storableMessages(thread)
    if (!chatHasBegun(messages)) return
    const title = chatName || chatTitle(messages)
    void enqueueChats(async () => {
      const kept = await loadChats(currentProjectId)
      const there = kept.find((chat) => chat.id === chatId)
      if (there && there.title === title && JSON.stringify(there.messages) === JSON.stringify(messages)) return
      // The memory of the chat, written when it was left, stays with it until the chat is looked at again.
      const memory = there ? { ...(there.pinned ? { pinned: true } : {}), ...(there.summary ? { summary: there.summary } : {}), ...(there.summarisedAt ? { summarisedAt: there.summarisedAt } : {}), ...(there.summaryEdited ? { summaryEdited: true } : {}) } : {}
      await saveChats(currentProjectId, upsertChat(kept, { id: chatId, title, ...(chatName ? { named: true } : {}), updatedAt: lastActive(messages, there?.updatedAt) ?? new Date().toISOString(), messages, ...memory }))
    })
  }, [thread, chatId, chatName, currentProjectId, enqueueChats])

  // Droplet's notes on the project are brought up to date after the founder saves: the index at once, and a digest in the background. Nothing waits for it,
  // and nothing is done when the founder has switched the notes off.
  useEffect(() => onDocumentSaved((projectId, kind) => void keepNotes(projectId, projectName(projectId), kind)), [projectName])

  // Once a workspace exists the conversation moves to a side panel, beside it.
  const docked = workspace !== null || invoice !== null || board !== null || libraryOpen
  // The workspace that is on screen, which is none while the library is.
  const shown = libraryOpen ? null : shownWorkspace({ brand: workspace !== null, invoice: invoice !== null, board: board !== null }, view)

  // The project is read when Home opens, when another is chosen, and when the workspace on screen changes, so a plan is ticked from what is saved.
  useEffect(() => {
    void refreshProject()
  }, [refreshProject, currentProjectId, shown, thread.length])

  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  const message = useCallback(
    (from: ThreadMessage['from'], text: string, pending = false): ThreadMessage => ({ id: nextMessageId.current++, from, text, pending, ...(pending ? {} : { at: new Date().toISOString() }) }),
    [],
  )

  const dispatch = useCallback((action: WorkspaceAction) => setWorkspace((current) => (current ? reduce(current, action) : current)), [])
  const dispatchBoard = useCallback((action: BoardAction) => setBoard((current) => (current ? reduceBoard(current, action) : current)), [])
  const dispatchInvoice = useCallback((action: InvoiceAction) => setInvoice((current) => (current ? reduceInvoice(current, action) : current)), [])

  // Puts a workspace on screen. The library, if it is shown, gives way to it.
  const changeView = useCallback((next: WorkspaceView) => {
    libraryOpenRef.current = false
    setLibraryOpen(false)
    setView(next)
  }, [])

  // Whether the board has been saved, for what the composer is told.
  const boardSaveStatus = async (state: BoardState) => {
    const saved = await loadBoard(currentProjectId)
    return saved ? (isBoardUnsaved(boardDocOf(state), saved) ? ('unsaved' as const) : ('saved' as const)) : ('none' as const)
  }

  // The side panel takes width, so the sidebar steps back to icons the first time. It can be opened again.
  const workspaceOpened = useCallback(() => setCollapsed(true), [])

  // The workspace the composer works on is the one on screen: the palette, the invoice or the board.
  const onScreen = (): View | undefined => libraryOpenRef.current ? undefined : shownWorkspace({ brand: workspaceRef.current !== null, invoice: invoiceRef.current !== null, board: boardRef.current !== null }, viewRef.current) ?? undefined

  // The workspaces that are open, one of which is on screen, so the composer can switch to one by name.
  const openNow = (): View[] => [...(workspaceRef.current ? (['brand'] as const) : []), ...(invoiceRef.current ? (['invoice'] as const) : []), ...(boardRef.current ? (['board'] as const) : [])]

  // The step of the guided invoice that is on screen, as the composer is told it.
  const guideOf = (invoiceId: string) => {
    const progress = progressFor(guideRef.current, invoiceId)
    return { step: progress.step, position: stepIndex(progress.step) + 1, of: GUIDE_STEPS.length }
  }

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
      changeView(target)
      workspaceOpened()
    },
    [changeView, currentProjectId, workspaceOpened],
  )

  // One question to the composer and what comes of it. If the composer says the request belongs to the other workspace, that one
  // is opened and the question is asked again, once, with it in front of the composer.
  const converse = useCallback(
    async (text: string, history: { role: 'founder' | 'droplet'; text: string }[], pendingId: number, routed: boolean, mode: Mode = 'base') => {
      const view = onScreen()
      const [saved, memory, savedBoard] = await Promise.all([loadPalette(currentProjectId), loadMemory(currentProjectId), loadBoard(currentProjectId)])
      // Where the founder is on the journey, so the composer can guide: only the business name, the offer and counts.
      const project = snapshotOfProject({ projectName: projectName(currentProjectId), memory, hasPalette: saved !== null, boardItems: savedBoard?.items.length ?? 0 })
      setProjectInfo(project)
      const open = workspaceRef.current
      const invoiceOpen = invoiceRef.current
      const boardOpen = boardRef.current
      const boardStatus = view === 'board' && boardOpen ? await boardSaveStatus(boardOpen) : 'none'
      // Short memories of earlier chats, if the founder has not switched that off: the ones that match the request, at most three.
      const earlier = settingOn(memory, 'recall') ? selectEarlierChats(await loadChats(currentProjectId), { currentChatId: chatIdRef.current, task: view ? TASK_OF_VIEW[view] : undefined, intent: text }) : []
      // Droplet's notes on the other workspaces, if the founder has not switched them off: their digests, and lines that match what was asked.
      // What is saved, for opening or exporting one of its things when asked: counts, names and statuses only.
      const libraryData = libraryOf({ palette: saved, board: savedBoard, memory, notes: {} })
      const projectNotes = settingOn(memory, 'notes') ? notesForRequest(await loadNotes(currentProjectId), { onScreen: view, intent: text }) : null
      const result = await requestComposition({
        intent: text,
        // Advanced is the founder's choice for this message. Quick is sent as no mode at all.
        ...(mode === 'advanced' ? { mode } : {}),
        ...(history.length > 0 ? { history } : {}),
        ...(view ? { view } : {}),
        ...(openNow().length > 0 ? { open: openNow() } : {}),
        ...(chatNameRef.current ? { chatTitle: chatNameRef.current } : {}),
        ...(view === 'invoice' && invoiceOpen ? { invoice: snapshotOfInvoice(invoiceOpen, memory, todayIso()) } : {}),
        // In Guide mode the composer is told which step is on screen, so it helps with that one. It cannot move the founder on.
        ...(view === 'invoice' && invoiceOpen && useWorkMode.getState().mode === 'guide' ? { guide: guideOf(invoiceDocOf(invoiceOpen).invoiceId) } : {}),
        ...(view === 'brand' && open
          ? { workspace: snapshotOfState(open, drawnRef.current.layout.length > 0 ? drawnRef.current.layout : null, saved ? (isUnsaved(docOf(open), saved) ? 'unsaved' : 'saved') : 'none') }
          : {}),
        ...(view === 'board' && boardOpen
          ? { board: snapshotOfBoard(boardOpen, boardHandleRef.current?.viewMiddle() ?? { x: 2400, y: 1600 }, boardStatus) }
          : {}),
        ...(saved ? { memory: paletteSnapshotOf(saved.blocks) } : {}),
        ...(earlier.length > 0 ? { earlierChats: earlier } : {}),
        ...(projectNotes ? { notes: projectNotes } : {}),
        library: snapshotOfLibrary(libraryData),
        project,
      })

      // The reply goes into the message that was pending. Droplet's question and the answers it suggests sit apart from the text, so
      // notes from the app land between the answer and the question, and the question stays last.
      const finish = (reply: string, turn?: { question?: string; replies?: string[]; blocks?: ChatBlock[] }, grounding?: Grounding, card?: { receipt: Receipt; live: { undo: boolean; show: boolean } }, proposals?: ProposalView[]) =>
        setThread((current) =>
          current.map((item) =>
            item.id === pendingId
              ? {
                  ...item,
                  text: reply,
                  pending: false,
                  at: new Date().toISOString(),
                  ...(card ? { receipt: card.receipt, receiptLive: card.live } : {}),
                  ...(proposals && proposals.length > 0 ? { proposals } : {}),
                  ...(turn?.blocks && turn.blocks.length > 0 ? { blocks: turn.blocks } : {}),
                  ...(grounding ? { grounding } : {}),
                  ...(turn?.question ? { question: turn.question, ...(turn.replies && turn.replies.length > 0 ? { replies: turn.replies } : {}) } : {}),
                }
              : item,
          ),
        )

      // The server counts the Advanced allowance and says where it stands with every answer, and with a refusal for having none left.
      setAllowance(result.allowance)
      if (!result.ok) return finish(result.message)

      // The composer names the conversation once it has a subject, and may rename it if the subject changes.
      const named = result.turn.title ? cleanTitle(result.turn.title) : ''
      if (named) nameChat(named)

      const target = routedTo(result.turn, view)
      if (target && !routed) {
        // Taking the founder to another workspace: the next answer is asked with that workspace in front of the composer and says
        // what it did, so it replaces this one. Showing both said the same thing twice ("Opening the invoice workspace" twice).
        // A reply that searched the web is the exception: it carries sources the founder should see, so it stays and the next one follows it.
        if (result.grounding) {
          finish(result.turn.message, undefined, result.grounding)
          await openWorkspaceFor(target)
          const next = message('droplet', '', true)
          setThread((current) => [...current, next])
          return converse(text, history, next.id, true, mode)
        }
        await openWorkspaceFor(target)
        return converse(text, history, pendingId, true, mode)
      }

      // What the app adds to the model's own words, each as a paragraph of its own.
      const notes: (string | undefined)[] = [result.note]
      // What the reply did to the workspace on screen, for the receipt under it: built in code from what was applied, never from the model's words.
      let done: { workspace: ReceiptWorkspace; changes: Change[]; skipped: { action: { type: string }; reason: string }[]; before: unknown; after: unknown } | null = null
      const historyTurn = result.turn.actions.some((action) => action.type === 'undo' || action.type === 'redo')
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
          arrivalRef.current = prepareArrival(focusOf(applied.changes))
          invoiceRef.current = applied.state
          setInvoice(applied.state)
        }
        done = { workspace: 'invoice', changes: applied.changes, skipped: applied.skipped, before: invoiceDocOf(base), after: invoiceDocOf(applied.state) }
      } else if (view === 'board' && boardOpen) {
        // Applied to the board as it is now, which may have changed while the composer was thinking. The places are found here, in code, from the
        // board as it is, and never from the model.
        const base = boardRef.current ?? boardOpen
        const actions = result.turn.actions.filter((action): action is BoardTurnAction => isBoardAction(action) || action.type === 'undo' || action.type === 'redo')
        const applied = applyBoardTurnActions({ base, actions, view: boardHandleRef.current?.viewMiddle() ?? { x: 2400, y: 1600 } })
        if (applied.state !== base) {
          arrivalRef.current = prepareArrival(focusOf(applied.changes))
          boardRef.current = applied.state
          setBoard(applied.state)
          // The first time the composer puts notes on the board, the founder is told what to do with them.
          const mine = (state: BoardState) => boardDocOf(state).items.filter((item) => item.kind === 'note' && item.author === 'ai').length
          if (mine(applied.state) > mine(base) && mine(base) === 0) notes.push('My notes are pink. Select one to keep it as yours, or delete it.')
        }
        done = { workspace: 'board', changes: applied.changes, skipped: applied.skipped, before: boardDocOf(base), after: boardDocOf(applied.state) }
      } else {
        // Applied to the workspace as it is now, which may have changed while the model was thinking.
        const applied = applyTurnActions({
          base: workspaceRef.current,
          open: (blocks) => openWorkspace(blocks, saved),
          actions: result.turn.actions.filter((action): action is PaletteAction => !isInvoiceAction(action) && !isBoardAction(action) && !isScreenAction(action)),
          env: drawnRef.current,
        })
        const wasState = workspaceRef.current
        const skipped: { action: { type: string }; reason: string }[] = [...applied.skipped]
        const changes = [...applied.changes]
        if (applied.state && applied.state !== workspaceRef.current) {
          arrivalRef.current = prepareArrival(focusOf(applied.changes))
          setWorkspace(applied.state)
          // The palette changed, so it is the one to look at.
          changeView('brand')
          spaceRef.current = 'brand'
          if (applied.opened) workspaceOpened()
        }
        if (applied.effects.includes('export') && applied.state) {
          const exported = await exportBrandSheet(docOf(applied.state).blocks, projectName(currentProjectId))
          if (exported) changes.push({ kind: 'added', text: 'Downloaded the brand sheet as a PDF', focus: [] })
          else skipped.push({ action: { type: 'export_brand_sheet' }, reason: 'it could not be made.' })
        }
        // A workspace opened by this reply has nothing earlier to go back to, so only one that was open can be undone.
        done = { workspace: 'brand', changes, skipped, before: wasState ? docOf(wasState) : null, after: applied.state && !applied.opened ? docOf(applied.state) : null }
      }
      // The screen actions come last, after the workspace's own: go back to a workspace that is open, or close them all and return to the full chat.
      const screen = result.turn.actions.find(isScreenAction)
      if (screen?.type === 'switch_to') {
        // Only to one that is open and not already shown. The check already made sure of it, and the refs are where the truth is.
        const isOpen = { brand: workspaceRef.current, invoice: invoiceRef.current, board: boardRef.current }[screen.workspace] !== null
        if (isOpen && screen.workspace !== onScreen()) {
          viewRef.current = screen.workspace
          spaceRef.current = screen.workspace === 'board' ? 'ideation' : screen.workspace
          changeView(screen.workspace)
        }
      }
      // Something saved is opened or exported when the founder asked. The app does it from what is saved, and says how it went in its own words, never
      // from the model's.
      if (screen?.type === 'open_item' || screen?.type === 'export_item') {
        const invoices = libraryData.items.filter((item): item is InvoiceItem => item.section === 'invoices')
        const invoiceFound = screen.item === 'invoice' ? findInvoice(invoices, screen.which) : null
        if (screen.type === 'open_item') {
          const target: OpenTarget | null = screen.item === 'brand' ? { kind: 'brand' } : screen.item === 'ideas' ? { kind: 'board' } : invoiceFound ? { kind: 'invoice', id: invoiceFound.invoiceId } : null
          if (target && (await openFromLibraryRef.current(target)) === 'unsaved') {
            notes.push('The invoice you have open has changes that are not saved, so I did not replace it. Save it or leave it, then ask again.')
          }
        } else {
          const target: ExportTarget | null = screen.item === 'brand' ? { kind: 'brand' } : screen.item === 'ideas' ? { kind: 'ideas', format: screen.format ?? 'pdf' } : invoiceFound ? { kind: 'invoice', id: invoiceFound.invoiceId } : null
          if (target) {
            const outcome = await exportLibraryItem(currentProjectId, projectName(currentProjectId), target)
            notes.push(outcome.ok ? outcome.text : `I could not export it. ${outcome.reason}`)
            setLibraryVersion((count) => count + 1)
          }
        }
      }
      // An answer that searched the web is shown as the model gave it, with nothing of the app's mixed in (Google's terms), so the app's own
      // notes go in a message of their own after it.
      // The receipt of what the reply changed goes under it, between the answer and its question. For an answer that searched, it goes in the app's own
      // message after it, for the same reason.
      const receipt = done ? buildReceipt(done.workspace, done.changes, done.skipped) : null
      const targets: FocusTarget[] = done ? focusOf(done.changes) : []
      const changedSomething = Boolean(done && done.changes.length > 0 && done.after !== null && done.after !== done.before)
      const live = done && receipt ? { workspace: done.workspace, after: done.after, targets, undoable: changedSomething && !historyTurn } : null
      const card = receipt && live ? { receipt, live: { undo: live.undoable, show: targets.some((target) => target.how !== 'removed') } } : undefined
      // The facts it offers to remember, less any the project already holds with these words and any the founder said Not now to in this chat.
      const proposals: ProposalView[] = (result.turn.propose ?? []).flatMap((proposal) => {
        if (dismissedFactsRef.current.has(`${chatIdRef.current}:${proposal.key}`)) return []
        const status = factStatus(memory, proposal.key, proposal.value)
        if (status !== 'new' && status !== 'updated') return []
        return [{ key: proposal.key, value: factText(proposal.value), ...(status === 'updated' ? { was: currentFacts(memory)[proposal.key] } : {}) }]
      })
      if (result.grounding) {
        finish(result.turn.message, result.turn, result.grounding)
        const said = paragraphs(...notes)
        if (said || receipt || proposals.length > 0) {
          const kept = {
            ...message('droplet', said || (receipt ? `${receipt.heading}.` : 'Here is what I can remember.')),
            local: true,
            ...(card ? { receipt: card.receipt, receiptLive: card.live } : {}),
            ...(proposals.length > 0 ? { proposals } : {}),
          }
          if (live) receiptsRef.current.set(kept.id, live)
          setThread((current) => [...current, kept])
        }
      } else {
        finish(paragraphs(result.turn.message, ...notes), result.turn, undefined, card, proposals)
        if (live) receiptsRef.current.set(pendingId, live)
      }
      // Closing is the same as the button's: it asks in the thread first if anything is unsaved, after the reply, so the founder reads it first.
      if (screen?.type === 'close_workspace') await leaveWorkspacesRef.current()
    },
    // onScreen only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentProjectId, message, nameChat, openWorkspaceFor, projectName, setAllowance, workspaceOpened],
  )

  const submitIntent = useCallback(
    async (text: string, mode: Mode = 'base', from?: FlightOrigin) => {
      if (busyRef.current) return
      busyRef.current = true
      const pending = message('droplet', '', true)
      // The conversation so far, without the reply still being worked on.
      const history = threadRef.current
        .filter((item) => item.from !== 'divider' && !item.local && !item.pending && item.text)
        .slice(-MAX_HISTORY_MESSAGES)
        .map((item) => ({
          role: item.from === 'you' ? ('founder' as const) : ('droplet' as const),
          // What Droplet showed in a table or a plan goes with its words, so it can build on it. The question stays last, whatever is cut.
          text: paragraphs(item.text.slice(0, 700), describeBlocks(item.blocks, item.checks, doneSet).slice(0, 500), item.question).slice(0, 1500),
        }))
      // A move to another workspace is marked once, here, when something is said in it.
      const space = spaceRef.current
      const moved = space !== null && sentInRef.current !== undefined && sentInRef.current !== space
      sentInRef.current = space
      const you = message('you', text)
      // A message typed in the bar comes out of the top of it and settles into the thread (see FlyingMessage); a tapped reply has no bar to come from.
      if (from && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setFlight({ id: you.id, from })
      setThread((current) => [...current, ...(moved ? [message('divider', `Switched workspace to ${SPACE_NAMES[space]}`)] : []), you, pending])
      setComposing(true)
      try {
        // A tap on an Open button is exactly one of the Open phrases. The workspace is opened here, in code, so the composer is asked once with it
        // on screen, and does not have to answer first with a request to open it.
        const phrase = workspaceForPhrase(text)
        if (phrase) await openWorkspaceFor(phrase)
        await converse(text, history, pending.id, false, mode)
        // If the composer took the founder to another workspace, that is where they are now, and no divider is owed for it.
        sentInRef.current = spaceRef.current
      } finally {
        setComposing(false)
        busyRef.current = false
      }
    },
    [converse, doneSet, message, openWorkspaceFor],
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
        changeView('brand')
        if (workspaceRef.current) return
        const saved = await loadPalette(currentProjectId)
        if (workspaceRef.current) return
        const opened = openWorkspace(saved?.blocks ?? starterBlocks(), saved)
        workspaceRef.current = opened
        setWorkspace(opened)
        workspaceOpened()
      } else if (id === 'invoice') {
        changeView('invoice')
        if (invoiceRef.current) return
        const opened = await openInvoiceForProject(currentProjectId)
        if (invoiceRef.current) return
        invoiceRef.current = opened
        setInvoice(opened)
        workspaceOpened()
      } else if (id === 'ideation') {
        changeView('board')
        if (boardRef.current) return
        const opened = await openBoardForProject(currentProjectId)
        if (boardRef.current) return
        boardRef.current = opened
        setBoard(opened)
        workspaceOpened()
      }
    },
    [changeView, currentProjectId, workspaceOpened],
  )

  // How Undo this ended, shown on the receipt. It can be pressed once.
  const settleReceipt = useCallback((messageId: number, status: string) => {
    setThread((current) =>
      current.map((item) => (item.id === messageId && item.receipt ? { ...item, receipt: { ...item.receipt, status }, receiptLive: item.receiptLive ? { ...item.receiptLive, undo: false } : undefined } : item)),
    )
  }, [])

  // Undo this: takes back what that reply did, as one step. Only when nothing has been done to the workspace since, which is when its
  // document is still the one the reply left. If it has moved on, it says so and points to the workspace's own Undo.
  const undoReceipt = useCallback(
    (messageId: number) => {
      const live = receiptsRef.current.get(messageId)
      if (!live || !live.undoable || busyRef.current) return
      const present = { brand: workspaceRef.current && docOf(workspaceRef.current), invoice: invoiceRef.current && invoiceDocOf(invoiceRef.current), board: boardRef.current && boardDocOf(boardRef.current) }[live.workspace]
      if (!present) return settleReceipt(messageId, 'That workspace is closed now, so there is nothing to undo.')
      if (present !== live.after) return settleReceipt(messageId, 'Things have changed since, so I cannot take back just this. Use Undo in the header to step back.')
      arrivalRef.current = null
      if (live.workspace === 'brand' && workspaceRef.current) {
        workspaceRef.current = reduce(workspaceRef.current, { type: 'undo' })
        setWorkspace(workspaceRef.current)
      } else if (live.workspace === 'invoice' && invoiceRef.current) {
        invoiceRef.current = reduceInvoice(invoiceRef.current, { type: 'undo' })
        setInvoice(invoiceRef.current)
      } else if (live.workspace === 'board' && boardRef.current) {
        boardRef.current = reduceBoard(boardRef.current, { type: 'undo' })
        setBoard(boardRef.current)
      }
      live.undoable = false
      settleReceipt(messageId, 'Undone. It is as it was before this reply.')
    },
    [settleReceipt],
  )

  // Show me: the workspace the change was made in comes to the front if it is not, the first thing that changed is brought into view, and each thing
  // gets its ring again.
  const showReceipt = useCallback(
    (messageId: number) => {
      const live = receiptsRef.current.get(messageId)
      if (!live || busyRef.current) return
      const open = { brand: workspaceRef.current, invoice: invoiceRef.current, board: boardRef.current }[live.workspace] !== null
      if (!open) return settleReceipt(messageId, 'That workspace is closed now.')
      const switching = onScreen() !== live.workspace
      if (switching) {
        viewRef.current = live.workspace
        spaceRef.current = live.workspace === 'board' ? 'ideation' : live.workspace
        changeView(live.workspace)
      }
      // Once it is on screen, if it had to be brought there.
      window.setTimeout(() => revealTargets(live.targets), switching ? 120 : 0)
    },
    // onScreen only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settleReceipt],
  )

  // A fact Droplet offered was settled, so its chip goes.
  const removeProposal = useCallback((messageId: number, key: FactKey) => {
    setThread((current) => current.map((item) => (item.id === messageId && item.proposals ? { ...item, proposals: item.proposals.filter((proposal) => proposal.key !== key) } : item)))
  }, [])

  // Remember: the only way a fact gets in. It is read fresh and added, and a quiet note says so with Undo, which puts back what was there before.
  const rememberFact = useCallback(
    async (messageId: number, key: FactKey) => {
      const proposal = threadRef.current.find((item) => item.id === messageId)?.proposals?.find((entry) => entry.key === key)
      if (!proposal) return
      const projectId = currentProjectId
      const before = await loadMemory(projectId)
      const next = withFact(before, key, proposal.value, new Date().toISOString(), chatIdRef.current)
      if (next === before) return removeProposal(messageId, key)
      if (!(await saveMemory(projectId, next))) {
        setToast({ id: ++toastId.current, text: 'I could not remember that: it could not be stored.' })
        return
      }
      removeProposal(messageId, key)
      const was = currentFacts(before)[key]
      setToast({
        id: ++toastId.current,
        text: `Remembered: ${factLabel(key).toLowerCase()}.`,
        actionLabel: 'Undo',
        onAction: () => {
          void (async () => {
            const now = await loadMemory(projectId)
            await saveMemory(projectId, was !== undefined ? withFact(now, key, was, new Date().toISOString()) : forgetFact(now, key))
            void refreshProject()
          })()
        },
      })
      void refreshProject()
    },
    [currentProjectId, refreshProject, removeProposal],
  )

  // Not now: the fact is not offered again in this chat.
  const dismissFact = useCallback(
    (messageId: number, key: FactKey) => {
      dismissedFactsRef.current.add(`${chatIdRef.current}:${key}`)
      removeProposal(messageId, key)
    },
    [removeProposal],
  )

  // A box on a plan or a checklist in the chat was ticked or cleared. It is kept with the message, and so with the saved chat.
  const toggleCheck = useCallback((messageId: number, block: number, item: number, checked: boolean) => {
    setThread((current) => current.map((entry) => (entry.id === messageId ? { ...entry, checks: { ...entry.checks, [`${block}:${item}`]: checked } } : entry)))
  }, [])

  // A plan step's Open button: the founder asking outright for that workspace, in the words the composer is told to expect.
  const openStep = useCallback(
    (step: JourneyStep) => {
      const workspace = STEP_WORKSPACE[step]
      if (workspace) void submitIntent(OPEN_PHRASE[workspace])
    },
    [submitIntent],
  )

  // The conversations listed in the history: the open one first (once something has been said in it), then the project's others.
  const chatList: ChatEntry[] = (() => {
    const messages = storableMessages(thread)
    // The open chat keeps its place until the founder sends something in it: then it is the most recent and goes to the top.
    const kept = chats.find((chat) => chat.id === chatId)
    const open = chatHasBegun(messages) ? [{ id: chatId, title: chatName || chatTitle(messages), updatedAt: lastActive(messages, kept?.updatedAt) ?? '', current: true, pinned: kept?.pinned }] : []
    const others = chats.filter((chat) => chat.id !== chatId).map((chat) => ({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt, current: false, pinned: chat.pinned }))
    return byPinnedThenRecent([...open, ...others])
  })()

  // A chat that has been left is written down in a few lines, in the background, so a later chat can look back at it. Only if the founder has not switched
  // that off, only if the chat changed since it was last written down, and only if there was something said in it. Quick makes it, and it is checked
  // against the chat before it is kept. Nothing waits for it, and a failure is not shown: the chat is only without a memory.
  const summariseLeft = useCallback(
    (left: { id: string; projectId: string; thread: ThreadMessage[] }) => {
      const messages = storableMessages(left.thread)
      if (!hasFounderMessage(messages)) return
      void summarise()
      async function summarise() {
        if (!settingOn(await loadMemory(left.projectId), 'recall')) return
        // After the chat has been saved, so it is read as it was left.
        const kept = await enqueueChats(async () => (await loadChats(left.projectId)).find((chat) => chat.id === left.id))
        if (!needsSummary(kept, messages)) return
        const said = left.thread
          .filter((item) => (item.from === 'you' || item.from === 'droplet') && !item.local && !item.pending && item.text.trim() !== '')
          .slice(-MAX_CHAT_MESSAGES)
          .map((item) => ({ role: item.from === 'you' ? ('founder' as const) : ('droplet' as const), text: paragraphs(item.text, item.question).slice(0, 1500) }))
        const result = await requestSummary(said)
        if (!result.ok) return
        await enqueueChats(async () => {
          const chats = await loadChats(left.projectId)
          const chat = chats.find((entry) => entry.id === left.id)
          // A memory the founder wrote is theirs, and a chat that was deleted meanwhile has none.
          if (!chat || chat.summaryEdited) return
          // A memory that could not be trusted is no memory, but the chat has been looked at, so it is not asked again until it changes.
          await saveChats(left.projectId, chats.map((entry) => (entry.id === left.id ? { ...entry, summarisedAt: new Date().toISOString(), ...(result.summary ? { summary: result.summary } : {}) } : entry)))
        })
        void refreshChats(currentProjectRef.current)
      }
    },
    [enqueueChats, refreshChats],
  )

  // A conversation begins with nothing said, in no workspace's name, and no question left open.
  const beginChat = useCallback((id: string, messages: ThreadMessage[], projectId: string, name = '') => {
    // The one that is being left, in the project it belongs to (this is called before the project changes).
    if (chatIdRef.current !== id) summariseLeft({ id: chatIdRef.current, projectId: currentProjectRef.current, thread: threadRef.current })
    nameChat(name)
    leaveRef.current = null
    sentInRef.current = undefined
    nextMessageId.current = messages.reduce((highest, item) => Math.max(highest, item.id), 0) + 1
    void refreshChats(projectId)
    setChatId(id)
    setThread(messages)
  }, [nameChat, refreshChats, summariseLeft])

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

  // Pinned chats stay at the top of the list. A chat with nothing said in it yet is not kept, so it cannot be pinned.
  const pinChatById = useCallback(
    (id: string, pinned: boolean) => {
      void enqueueChats(async () => {
        await saveChats(currentProjectId, pinChat(await loadChats(currentProjectId), id, pinned))
      })
      void refreshChats(currentProjectId)
    },
    [currentProjectId, enqueueChats, refreshChats],
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
    libraryOpenRef.current = false
    setLibraryOpen(false)
    setView('brand')
    setCollapsed(false)
  }, [])

  // Only the invoice goes: a guided invoice that is finished. Another workspace that is open comes to the front, or the conversation has the whole screen.
  const closeInvoice = useCallback(() => {
    invoiceRef.current = null
    setInvoice(null)
    setGuide(null)
    const other: WorkspaceView | null = workspaceRef.current ? 'brand' : boardRef.current ? 'board' : null
    if (other) {
      viewRef.current = other
      spaceRef.current = other === 'board' ? 'ideation' : other
      setView(other)
    } else {
      spaceRef.current = null
      if (!libraryOpenRef.current) setCollapsed(false)
    }
  }, [])

  // The guided invoice is finished: confirmed and saved. It closes, and the chat shows what was made, with a way to export it and open it again.
  const finishGuided = useCallback(
    (result: InvoiceResult) => {
      closeInvoice()
      setThread((current) => [...current, { ...message('droplet', resultMessage(result)), result }])
      setLibraryVersion((count) => count + 1)
      void refreshProject()
    },
    [closeInvoice, message, refreshProject],
  )

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
  // The check itself, which a reply that closes the workspace runs too, while the request is still being worked on.
  const leaveWorkspaces = useCallback(async () => {
    if (leaveRef.current || checkingLeaveRef.current) return
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

  // The button, which does nothing while a request is being worked on.
  const backToChat = useCallback(async () => {
    if (busyRef.current) return
    await leaveWorkspaces()
  }, [leaveWorkspaces])

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

  // ---- The library ----

  // Shows the library, which takes the working screen while the conversation sits beside it.
  const openLibrary = useCallback(() => {
    libraryOpenRef.current = true
    setLibraryVersion((count) => count + 1)
    setLibraryOpen(true)
    workspaceOpened()
  }, [workspaceOpened])

  // Back from the library: to the workspace that was shown, or to the full conversation if none is open.
  const closeLibrary = useCallback(() => {
    libraryOpenRef.current = false
    setLibraryOpen(false)
    if (workspaceRef.current === null && invoiceRef.current === null && boardRef.current === null) setCollapsed(false)
  }, [])

  // The invoice workspace takes a replacement: a saved invoice, a copy of one or a new one. The arrangement stays as it is now.
  const arrangementNow = async () => {
    const present = invoiceRef.current
    return present ? invoiceDocOf(present) : await loadInvoice(currentProjectId)
  }

  // Does what a library item's Open asks for. Replacing the invoice that is open loses its unsaved changes, so that says so first and goes
  // ahead only when the founder has agreed.
  const openFromLibrary = useCallback(
    async (target: OpenTarget, options?: { confirmed?: boolean }): Promise<'done' | 'unsaved'> => {
      if (target.kind === 'brand') {
        await openWorkspaceFor('brand')
        return 'done'
      }
      if (target.kind === 'board') {
        await openWorkspaceFor('board')
        return 'done'
      }
      const present = invoiceRef.current
      const wanted = target.kind === 'invoice' ? target.id : null
      // The same invoice that is already open is only shown.
      if (present && wanted !== null && invoiceDocOf(present).invoiceId === wanted) {
        await openWorkspaceFor('invoice')
        return 'done'
      }
      if (present && target.kind !== 'business_details' && !options?.confirmed) {
        const [memory, arrangement] = await Promise.all([loadMemory(currentProjectId), loadInvoice(currentProjectId)])
        if (invoiceHasChanges(present, memory, arrangement)) return 'unsaved'
      }
      const arrangement = await arrangementNow()
      let next: InvoiceState | null = null
      if (target.kind === 'invoice') next = await openSavedInvoice(currentProjectId, target.id, arrangement)
      else if (target.kind === 'copy_invoice') next = await duplicateInvoice(currentProjectId, target.id, arrangement)
      else if (target.kind === 'new_invoice') {
        next = await openNewInvoice(currentProjectId, arrangement)
        const client = target.clientId ? (await loadMemory(currentProjectId)).clients.find((saved) => saved.id === target.clientId)?.client : undefined
        if (next && client) next = reduceInvoice(next, { type: 'set_client', patch: client })
      } else if (!present) next = await openInvoiceForProject(currentProjectId)
      if (next) {
        invoiceRef.current = next
        setInvoice(next)
      }
      if (!invoiceRef.current) return 'done'
      // Your business details: the invoice with that step open, ready to edit. In Guide mode, the guide's own step.
      const openId = invoiceDocOf(invoiceRef.current).invoiceId
      if (target.kind === 'business_details') {
        invoiceRef.current = reduceInvoice(invoiceRef.current, { type: 'batch', actions: [{ type: 'show', component: 'business' }, { type: 'expand_tool', id: 'business' }] })
        setInvoice(invoiceRef.current)
        setGuide((current) => jumpTo(progressFor(current, openId), 'business'))
      }
      // A saved invoice is whole, so the guide opens on its last step, where every step before it can be gone back to.
      if (target.kind === 'invoice') setGuide({ invoiceId: openId, step: 'review', reached: GUIDE_STEPS.length - 1 })
      await openWorkspaceFor('invoice')
      return 'done'
    },
    // arrangementNow reads refs and the project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentProjectId, openWorkspaceFor],
  )

  // The card of an invoice finished in Guide mode: export it from what is saved, or open it again.
  const renderResult = useCallback(
    (item: ThreadMessage) =>
      item.result ? (
        <InvoiceResultCard
          projectId={currentProjectId}
          result={item.result}
          busy={composing}
          onExport={async () => {
            const outcome = await exportLibraryItem(currentProjectId, projectName(currentProjectId), { kind: 'invoice', id: item.result!.invoiceId })
            setLibraryVersion((count) => count + 1)
            return outcome.ok ? { ok: true, text: outcome.text } : { ok: false, text: `I could not export it. ${outcome.reason}` }
          }}
          onOpen={async () => {
            if (busyRef.current) return
            const outcome = await openFromLibrary({ kind: 'invoice', id: item.result!.invoiceId })
            if (outcome === 'unsaved') setToast({ id: ++toastId.current, text: 'The invoice you have open has changes that are not saved. Save it or leave it first.' })
          }}
        />
      ) : null,
    [composing, currentProjectId, openFromLibrary, projectName],
  )

  // The tip that offers the workspace menu is for the very start, before the founder has said anything.
  const bar = (isDocked: boolean) => (
    <IntentBar docked={isDocked} busy={composing} showTip={!chatHasBegun(thread)} allowance={allowance} onSubmitIntent={submitIntent} onChooseTask={chooseTask} />
  )
  const chatBar = (isDocked: boolean) => (
    <ChatBar onFullScreen={isDocked ? backToChat : undefined} busy={composing} />
  )

  return (
    <div className={docked ? 'home home--docked' : 'home'} data-start={(!docked && !chatHasBegun(thread)) || undefined}>
      <Sidebar
        projects={projects}
        currentProjectId={currentProjectId}
        onSelectProject={selectProject}
        onOpenBrief={() => setBriefOpen(true)}
        onOpenLibrary={libraryOpen ? closeLibrary : openLibrary}
        libraryOpen={libraryOpen}
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
        onPinChat={pinChatById}
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
        <ChatGlow />
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

        <main ref={canvasRef} className={docked ? (shown === 'board' ? 'home__canvas home__canvas--board' : shown === 'invoice' && workMode === 'guide' ? 'home__canvas home__canvas--guide' : 'home__canvas') : 'home__canvas home__canvas--chat'} aria-busy={composing}>
          <h1 className="visually-hidden">Home</h1>
          {/* Before there is a workspace, the whole screen is the conversation. Droplet answers like any assistant until it is asked to build something. */}
          {!docked && (
            <div className="home__conversation">
              {chatBar(false)}
              <ChatThread flight={flight} onFlightEnd={() => setFlight(null)} messages={thread} onAction={onThreadAction} onReply={submitIntent} done={doneSet} busy={composing} onToggle={toggleCheck} onOpenStep={openStep} onUndoReceipt={undoReceipt} onShowReceipt={showReceipt} onRememberFact={rememberFact} onDismissFact={dismissFact} renderResult={renderResult} />
            </div>
          )}
          {/* One workspace at a time: the one on screen leaves before the other arrives, so their toolbars and header controls never overlap. */}
          <AnimatePresence mode="wait">
            {libraryOpen && (
              <motion.div key="library" className="home__component" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                <Library
                  projectId={currentProjectId}
                  projectName={projectName(currentProjectId)}
                  version={libraryVersion}
                  onClose={closeLibrary}
                  onOpen={openFromLibrary}
                  onAsk={(text) => void submitIntent(text)}
                  onChanged={() => void refreshProject()}
                />
              </motion.div>
            )}
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
                {workMode === 'guide' ? (
                  <GuidedInvoice
                    key={`${currentProjectId}:${invoice.history.present.invoiceId}`}
                    projectId={currentProjectId}
                    projectName={projectName(currentProjectId)}
                    state={invoice}
                    dispatch={dispatchInvoice}
                    progress={progressFor(guide, invoice.history.present.invoiceId)}
                    onProgress={(next) => {
                      guideRef.current = next
                      setGuide(next)
                    }}
                    onFinished={finishGuided}
                    saveSignal={invoiceSaveSignal}
                    onConfirmed={invoiceConfirmed}
                    headerSlots={{ start: headerStart, end: headerEnd, shelf: shelfSlot }}
                  />
                ) : (
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
                )}
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

        {/* The bar sits in the middle of an empty chat and at the bottom of one that has begun: the footer's own position is animated between the two. */}
        {!docked && (
          <motion.footer className="home__footer" layout="position" transition={{ type: 'spring', stiffness: 220, damping: 30, mass: 0.9 }}>
            {thread.length === 0 && <ChatGreeting name={userName} />}
            {bar(false)}
          </motion.footer>
        )}
        {/* The blue light that travels out from the middle of the canvas while Droplet works, with the ripple of the windows. */}
        <RippleGlow active={composing && docked} />
      </div>

      {docked && (
        <motion.aside
          className="home__chat on-shell"
          aria-label="Conversation"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          // A palette saved or an invoice confirmed beside the chat shows as a tick in a plan the moment the founder looks back at it.
          onPointerEnter={() => void refreshProject()}
          onFocusCapture={() => void refreshProject()}
        >
          {chatBar(true)}
          <ChatThread flight={flight} onFlightEnd={() => setFlight(null)} messages={thread} onAction={onThreadAction} onReply={submitIntent} done={doneSet} busy={composing} onToggle={toggleCheck} onOpenStep={openStep} onUndoReceipt={undoReceipt} onShowReceipt={showReceipt} onRememberFact={rememberFact} onDismissFact={dismissFact} renderResult={renderResult} />
          {bar(true)}
        </motion.aside>
      )}

      <ProjectBrief open={briefOpen} onClose={() => setBriefOpen(false)} projectId={currentProjectId} projectName={projectName(currentProjectId)} enqueue={enqueueChats} onChanged={() => void refreshProject()} />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
