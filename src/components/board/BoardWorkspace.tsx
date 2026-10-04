import { useMemo, useRef, useState, type RefObject } from 'react'
import { CursorIcon, FrameIcon, LayersMinimalisticIcon, NotesIcon, RoutingIcon, StopIcon, TextFieldIcon } from '@solar-icons/react/linear'
import { BOARD_SPEC, canRedoBoard, canUndoBoard, docOf, isBoardUnsaved, type BoardAction, type BoardState } from '../../lib/boardState.ts'
import { loadBoard, saveBoard } from '../../lib/boardStore.ts'
import { loadMemory, saveMemory } from '../../lib/memoryStore.ts'
import type { ProjectMemory } from '../../lib/memorySave.ts'
import { forgetIdea, withIdea, type IdeaKind } from '../../lib/projectMemory.ts'
import type { WorkspaceItem } from '../GridWorkspace.tsx'
import type { ShelfTool } from '../ToolShelf.tsx'
import WorkspaceShell, { type HeaderSlots } from '../WorkspaceShell.tsx'
import BoardCanvas, { type BoardHandle } from './BoardCanvas.tsx'
import SummaryWindow from './SummaryWindow.tsx'
import BoardExportMenu from './BoardExportMenu.tsx'
import { exportBlockedReason, exportBoard, type BoardFormat } from '../../lib/boardExport.ts'
import { ArrowTool, FrameTool, SelectTool, ShapeTool, StickyTool, TemplatesTool, TextTool } from './BoardTools.tsx'

type Props = {
  projectId: string
  projectName?: string
  state: BoardState
  dispatch: (action: BoardAction) => void
  // What the board can be asked of, for the parts of the app outside the workspace (such as where the founder is looking).
  handleRef?: RefObject<BoardHandle | null>
  headerSlots?: HeaderSlots
  // Asks Droplet something in the conversation, as if the founder had typed it. The summary window uses it for "write one".
  onAsk?: (text: string) => void
}

// What each part is for, said once, shown as its tooltip and as the window's reason.
const REASONS = {
  select: 'Move, resize and write in notes, drag a box around several, and delete. This is the tool in hand unless you pick another.',
  sticky: 'Press it, then click on the board where the note goes. The colours are for the next note. The plus puts one in the middle of the view.',
  shape: 'Click for a shape of the usual size, or drag to draw it to size. The kinds are for the next shape, and the plus puts one in the middle of the view.',
  text: 'Words on the board with nothing behind them, for a heading or a label. Click, or drag to draw the box.',
  frame: 'A labelled area that groups what is inside it, and moves with it. Drag to draw it to size. A frame never holds another frame.',
  connector: 'Pull an arrow from a thing to another, or to a point of its own, from this tool or from the dots on a selected thing. It follows them when they move.',
  templates: 'A starting layout for a kind of thinking, put near the middle of the view for you to fill in. Every part of it can be written in, moved, resized, recoloured and deleted.',
  summary: 'What is decided, what is still open and what comes next, from the board. Droplet writes it when you ask and you can change any line. It is saved with the board.',
  board: 'Your thinking, laid out. The board has an edge, and nothing goes past it. Notes in pink were written by Droplet when you asked.',
}

// The board workspace: a toolbar of the tools in hand, and the board, on the shared workspace shell. "Save" saves the notes and how the
// workspace is arranged. Nothing is saved until the founder saves.
export default function BoardWorkspace({ projectId, projectName = 'Droplet', state, dispatch, handleRef, headerSlots, onAsk }: Props) {
  const [saved, setSaved] = useState(() => loadBoard(projectId))
  const [saveFailed, setSaveFailed] = useState(false)
  const ownRef = useRef<BoardHandle | null>(null)
  const boardRef = handleRef ?? ownRef

  // What the project remembers. Words are only put in it from the board after the founder's confirm, and only here.
  const [memory, setMemory] = useState<ProjectMemory>(() => loadMemory(projectId))
  const remember = (kind: IdeaKind, text: string) => {
    const next = withIdea(memory, kind, text, new Date().toISOString())
    if (saveMemory(projectId, next)) setMemory(next)
  }
  const forget = (kind: IdeaKind) => {
    const next = forgetIdea(memory, kind)
    if (saveMemory(projectId, next)) setMemory(next)
  }

  const doc = docOf(state)
  const unsaved = isBoardUnsaved(doc, saved)
  const saveStatus = saveFailed ? 'Could not save' : !saved ? 'Not saved yet' : unsaved ? 'Unsaved changes' : 'All changes saved'

  const save = () => {
    const result = saveBoard(projectId, { items: doc.items, summary: doc.summary, layout: doc.layout, tools: doc.tools, expanded: doc.expanded, hidden: doc.hidden })
    setSaveFailed(result === null)
    if (result) setSaved(result)
  }

  const reason = (id: keyof typeof REASONS) => doc.reasons[id] ?? REASONS[id]

  const tools: Record<string, ShelfTool> = useMemo(
    () => ({
      select: { id: 'select', title: 'Select', icon: CursorIcon, reason: reason('select'), fixed: true, node: <SelectTool state={state} dispatch={dispatch} /> },
      sticky: { id: 'sticky', title: 'Sticky note', icon: NotesIcon, reason: reason('sticky'), fixed: true, node: <StickyTool state={state} dispatch={dispatch} boardRef={boardRef} /> },
      shape: { id: 'shape', title: 'Shape', icon: StopIcon, reason: reason('shape'), fixed: true, node: <ShapeTool state={state} dispatch={dispatch} boardRef={boardRef} /> },
      text: { id: 'text', title: 'Text', icon: TextFieldIcon, reason: reason('text'), fixed: true, node: <TextTool state={state} dispatch={dispatch} boardRef={boardRef} /> },
      frame: { id: 'frame', title: 'Frame', icon: FrameIcon, reason: reason('frame'), fixed: true, node: <FrameTool state={state} dispatch={dispatch} boardRef={boardRef} /> },
      templates: { id: 'templates', title: 'Templates', icon: LayersMinimalisticIcon, reason: reason('templates'), fixed: true, node: <TemplatesTool boardRef={boardRef} /> },
      connector: { id: 'connector', title: 'Arrow', icon: RoutingIcon, reason: reason('connector'), fixed: true, node: <ArrowTool state={state} dispatch={dispatch} /> },
    }),
    // reason() only reads doc.reasons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, dispatch, doc.reasons],
  )

  const windows: Record<string, WorkspaceItem> = useMemo(
    () => ({
      board: {
        id: 'board',
        title: 'Board',
        w: BOARD_SPEC.windowSizes.board.w,
        minCols: 12,
        node: (
          <div className="workspace__card">
            <BoardCanvas state={state} dispatch={dispatch} reason={reason('board')} controlRef={boardRef} decide={{ memory, remember }} />
          </div>
        ),
        distance: 0.12,
      },
      summary: {
        id: 'summary',
        title: 'Summary',
        w: BOARD_SPEC.windowSizes.summary.w,
        minCols: 8,
        node: (
          <div className="workspace__card">
            <SummaryWindow
              summary={doc.summary}
              memory={memory}
              onEdit={(section, lines) => dispatch({ type: 'edit_summary', section, lines, at: new Date().toISOString() })}
              onAsk={() => onAsk?.('Write a summary of the board: what is decided, what is still open and what comes next.')}
              onForget={forget}
              reason={reason('summary')}
            />
          </div>
        ),
        distance: 0.3,
      },
    }),
    // reason() only reads doc.reasons; remember and forget only read the memory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, dispatch, doc.reasons, memory, onAsk],
  )

  return (
    <WorkspaceShell
      spec={BOARD_SPEC}
      arrangement={doc}
      dispatch={dispatch}
      tools={tools}
      windows={windows}
      canUndo={canUndoBoard(state)}
      canRedo={canRedoBoard(state)}
      onUndo={() => dispatch({ type: 'undo' })}
      onRedo={() => dispatch({ type: 'redo' })}
      saveStatus={saveStatus}
      unsaved={unsaved}
      onSave={save}
      exportButton={
        <BoardExportMenu
          onExport={(format: BoardFormat) => exportBoard(format, { items: doc.items, summary: doc.summary, memory, projectName })}
          blockedReason={(format) => exportBlockedReason(format, { items: doc.items, summary: doc.summary, memory })}
        />
      }
      headerSlots={headerSlots}
    />
  )
}
