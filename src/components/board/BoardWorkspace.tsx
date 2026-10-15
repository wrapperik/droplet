import { useMemo, useRef, useState, type RefObject } from 'react'
import { CursorIcon, FrameIcon, LayersMinimalisticIcon, NotesIcon, RoutingIcon, StopIcon, TextFieldIcon } from '@solar-icons/react/linear'
import { canRedoBoard, canUndoBoard, docOf, isBoardUnsaved, type BoardAction, type BoardState } from '../../lib/boardState.ts'
import { loadBoard, markBoardExported, saveBoard } from '../../lib/boardStore.ts'
import { loadMemory, saveMemory } from '../../lib/memoryStore.ts'
import type { ProjectMemory } from '../../lib/memorySave.ts'
import { useLoaded } from '../../hooks/useLoaded.ts'
import { emptyMemory, forgetIdea, withIdea, type IdeaKind } from '../../lib/projectMemory.ts'
import TaskBar, { type BarItem } from '../TaskBar.tsx'
import WorkspaceShell, { type HeaderSlots } from '../WorkspaceShell.tsx'
import BoardCanvas, { type BoardHandle } from './BoardCanvas.tsx'
import BoardExportMenu from './BoardExportMenu.tsx'
import EmptyBoard from './EmptyBoard.tsx'
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
  // How many pixels at the top of the screen are covered by the header and the toolbar, which the board is drawn under.
  topInset?: number
}

// What each part is for, said once, shown as its tooltip on the task bar and as the board's reason.
const REASONS = {
  select: 'Move, resize and write in notes, drag a box around several, and delete. This is the tool in hand unless you pick another.',
  sticky: 'Press it, then click on the board where the note goes. The colours are for the next note. The plus puts one in the middle of the view.',
  shape: 'Click for a shape of the usual size, or drag to draw it to size. The kinds are for the next shape, and the plus puts one in the middle of the view.',
  text: 'Words on the board with nothing behind them, for a heading or a label. Click, or drag to draw the box.',
  frame: 'A labelled area that groups what is inside it, and moves with it. Drag to draw it to size. A frame never holds another frame.',
  connector: 'Pull an arrow from a thing to another, or to a point of its own, from this tool or from the dots on a selected thing. It follows them when they move.',
  templates: 'A starting layout for a kind of thinking, put near the middle of the view for you to fill in. Every part of it can be written in, moved, resized, recoloured and deleted.',
  board: 'Your thinking, laid out. The board has an edge, and nothing goes past it. Notes in pink were written by Droplet when you asked.',
}

// The board workspace: the task bar of the tools in hand, and the board, on the shared workspace shell. "Save" saves what is on the board. Nothing is saved
// until the founder saves. The board fills the whole screen behind the header and the bar, so it has no panes.
export default function BoardWorkspace({ projectId, projectName = 'Droplet', state, dispatch, handleRef, headerSlots, topInset = 0 }: Props) {
  // What was saved, and what the project remembers, are read from storage, which takes a moment. Until they have arrived the bar says nothing
  // and Save waits.
  const { value: saved, loaded, set: setSaved } = useLoaded(projectId, () => loadBoard(projectId), null)
  const [saveFailed, setSaveFailed] = useState(false)
  const ownRef = useRef<BoardHandle | null>(null)
  const boardRef = handleRef ?? ownRef

  // What the project remembers. Words are only put in it from the board after the founder's confirm, and only here.
  const { value: memory, set: setMemory } = useLoaded<ProjectMemory>(projectId, () => loadMemory(projectId), emptyMemory())
  const remember = async (kind: IdeaKind, text: string) => {
    const next = withIdea(memory, kind, text, new Date().toISOString())
    if (await saveMemory(projectId, next)) setMemory(next)
  }
  const forget = async (kind: IdeaKind) => {
    const next = forgetIdea(memory, kind)
    if (await saveMemory(projectId, next)) setMemory(next)
  }

  const doc = docOf(state)
  const unsaved = loaded && isBoardUnsaved(doc, saved)
  const saveStatus = !loaded ? '' : saveFailed ? 'Could not save' : !saved ? 'Not saved yet' : unsaved ? 'Unsaved changes' : 'All changes saved'

  const save = async () => {
    const result = await saveBoard(projectId, { items: doc.items })
    setSaveFailed(result === null)
    if (result) setSaved(result)
  }

  // Each tool is an icon and its name, and draws its own control (the button that puts it in hand, and its options). The order is fixed.
  const bar: BarItem[] = useMemo(() => {
    const item = (id: keyof typeof REASONS, title: string, icon: BarItem['icon'], control: BarItem['control']): BarItem => ({ id, title, label: title, reason: REASONS[id], icon, control })
    return [
      item('select', 'Select', CursorIcon, <SelectTool state={state} dispatch={dispatch} />),
      item('sticky', 'Sticky note', NotesIcon, <StickyTool state={state} dispatch={dispatch} boardRef={boardRef} />),
      item('shape', 'Shape', StopIcon, <ShapeTool state={state} dispatch={dispatch} boardRef={boardRef} />),
      item('text', 'Text', TextFieldIcon, <TextTool state={state} dispatch={dispatch} boardRef={boardRef} />),
      item('frame', 'Frame', FrameIcon, <FrameTool state={state} dispatch={dispatch} boardRef={boardRef} />),
      item('connector', 'Arrow', RoutingIcon, <ArrowTool state={state} dispatch={dispatch} />),
      item('templates', 'Templates', LayersMinimalisticIcon, <TemplatesTool boardRef={boardRef} />),
    ]
  }, [state, dispatch, boardRef])

  return (
    <>
    <WorkspaceShell
      bar={<TaskBar kind="tools" label="Board tools" items={bar} />}
      canUndo={canUndoBoard(state)}
      canRedo={canRedoBoard(state)}
      onUndo={() => dispatch({ type: 'undo' })}
      onRedo={() => dispatch({ type: 'redo' })}
      saveStatus={saveStatus}
      unsaved={unsaved}
      onSave={save}
      exportButton={
        <BoardExportMenu
          onExport={async (format: BoardFormat) => {
            const exported = await exportBoard(format, { items: doc.items, projectName })
            // A board that was saved and has not changed is marked as exported, so the library says so.
            if (exported && saved && !unsaved) {
              const marked = await markBoardExported(projectId)
              if (marked) setSaved(marked)
            }
            return exported
          }}
          blockedReason={() => exportBlockedReason(doc.items)}
        />
      }
      headerSlots={headerSlots}
    />
    <BoardCanvas state={state} dispatch={dispatch} reason={REASONS.board} controlRef={boardRef} decide={{ memory, remember, forget }} topInset={topInset} empty={<EmptyBoard onTemplate={(id) => boardRef.current?.addTemplate(id)} />} />
    </>
  )
}
