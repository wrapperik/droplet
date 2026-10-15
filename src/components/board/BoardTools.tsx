import { useCallback, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AddCircleIcon, CursorIcon, FrameIcon, LayersMinimalisticIcon, NotesIcon, RoutingIcon, StopIcon, TextFieldIcon } from '@solar-icons/react/linear'
import type { Icon } from '@solar-icons/react/lib/types'
import { useDismiss } from '../../hooks/useDismiss.ts'
import { TEMPLATES, framesOf, type TemplateDef } from '../../lib/boardTemplates.ts'
import { COLOUR_LABELS, CONNECTOR_STYLES, CONNECTOR_STYLE_LABELS, FOUNDER_COLOURS, SHAPE_KINDS, SHAPE_LABELS, type BoardAction, type BoardState, type Tool } from '../../lib/boardState.ts'
import { useBarTip } from '../taskBarContext.ts'
import { Toolbar } from '../Toolbar.tsx'
import type { AddKind, BoardHandle } from './BoardCanvas.tsx'
import './BoardTools.css'

// The tools on the task bar of the board. A tool is in hand until the next click on the board, and has no bigger form to be dragged out
// into, since what it does is done on the board itself. Each that puts something on the board also has a plus, which puts one in the middle of
// the view at once: that is the way to add one without a pointer. A tool shows its own options (the colour of the next note, the kind of the
// next shape, the line of the next arrow, the plus) only while it is in hand, so the bar stays one short row and what is on it is what can be
// used now. Pressing the tool puts it in hand, and the options are the next things to Tab to.

type Dispatch = (action: BoardAction) => void
type Common = { state: BoardState; dispatch: Dispatch }
type WithBoard = Common & { boardRef: RefObject<BoardHandle | null> }

// A tool's button on the bar: its icon and its name, always visible, with the tooltip of the bar's item (its full title and reason) as its description.
function BarButton({ icon: ToolIcon, label, ...props }: { icon: Icon; label: string; pressed?: boolean; onClick: () => void; menu?: { expanded: boolean; controls: string } }) {
  const tip = useBarTip()
  return (
    <button
      type="button"
      className="boardtool__toggle taskbar__trigger"
      aria-pressed={props.pressed}
      aria-haspopup={props.menu ? 'menu' : undefined}
      aria-expanded={props.menu?.expanded}
      aria-controls={props.menu?.controls}
      aria-describedby={tip}
      onClick={props.onClick}
    >
      <ToolIcon size={18} aria-hidden="true" />
      {label}
    </button>
  )
}

// The button that puts a tool in hand, or puts it down when it is pressed again.
function Toggle({ state, dispatch, tool, label, icon }: Common & { tool: Tool; label: string; icon: Icon }) {
  const inHand = state.tool === tool
  return <BarButton icon={icon} label={label} pressed={inHand} onClick={() => dispatch({ type: 'set_tool', tool: inHand ? 'select' : tool })} />
}

// The options of a tool in hand. They slide open beside the tool and close when it is put down. Reduced motion is respected by the page's
// motion settings.
function Options({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          className="boardtool__options"
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: 'auto' }}
          exit={{ opacity: 0, width: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

function Plus({ boardRef, kind, label }: { boardRef: RefObject<BoardHandle | null>; kind: AddKind; label: string }) {
  return (
    <button type="button" className="boardtool__add" aria-label={label} onClick={() => boardRef.current?.add(kind)}>
      <AddCircleIcon size={20} aria-hidden="true" />
    </button>
  )
}

// Select: move, resize, write in and delete what is on the board, and drag a box around several things.
export function SelectTool({ state, dispatch }: Common) {
  return (
    <Toolbar title="Select">
      <BarButton icon={CursorIcon} label="Select" pressed={state.tool === 'select'} onClick={() => dispatch({ type: 'set_tool', tool: 'select' })} />
    </Toolbar>
  )
}

// Sticky note: press it, then click on the board where the note goes. The colours are for the next note.
export function StickyTool({ state, dispatch, boardRef }: WithBoard) {
  return (
    <Toolbar title="Sticky note">
      <Toggle state={state} dispatch={dispatch} tool="sticky" label="Note" icon={NotesIcon} />
      <Options show={state.tool === 'sticky'}>
        <span className="boardtool__colours" role="radiogroup" aria-label="Colour of the next note">
          {FOUNDER_COLOURS.map((colour) => (
            <button key={colour} type="button" role="radio" className="boardtool__colour" data-colour={colour} aria-checked={state.noteColour === colour} aria-label={COLOUR_LABELS[colour]} title={COLOUR_LABELS[colour]} onClick={() => dispatch({ type: 'set_note_colour', colour })} />
          ))}
        </span>
        <Plus boardRef={boardRef} kind="note" label="Add a note to the middle of the view" />
      </Options>
    </Toolbar>
  )
}

// Shape: click for one of the usual size, or drag to draw it to size. The kinds are for the next shape.
export function ShapeTool({ state, dispatch, boardRef }: WithBoard) {
  return (
    <Toolbar title="Shape">
      <Toggle state={state} dispatch={dispatch} tool="shape" label="Shape" icon={StopIcon} />
      <Options show={state.tool === 'shape'}>
        <span className="boardtool__kinds" role="radiogroup" aria-label="Kind of the next shape">
          {SHAPE_KINDS.map((kind) => (
            <button key={kind} type="button" role="radio" className="boardtool__kind" data-shape={kind} aria-checked={state.shapeKind === kind} aria-label={SHAPE_LABELS[kind]} title={SHAPE_LABELS[kind]} onClick={() => dispatch({ type: 'set_shape_kind', shape: kind })}>
              <span aria-hidden="true" />
            </button>
          ))}
        </span>
        <Plus boardRef={boardRef} kind="shape" label="Add a shape to the middle of the view" />
      </Options>
    </Toolbar>
  )
}

// Text: words on the board with nothing behind them.
export function TextTool({ state, dispatch, boardRef }: WithBoard) {
  return (
    <Toolbar title="Text">
      <Toggle state={state} dispatch={dispatch} tool="text" label="Text" icon={TextFieldIcon} />
      <Options show={state.tool === 'text'}>
        <Plus boardRef={boardRef} kind="text" label="Add text to the middle of the view" />
      </Options>
    </Toolbar>
  )
}

// Frame: a labelled area that groups what is inside it. Drag to draw it to size.
export function FrameTool({ state, dispatch, boardRef }: WithBoard) {
  return (
    <Toolbar title="Frame">
      <Toggle state={state} dispatch={dispatch} tool="frame" label="Frame" icon={FrameIcon} />
      <Options show={state.tool === 'frame'}>
        <Plus boardRef={boardRef} kind="frame" label="Add a frame to the middle of the view" />
      </Options>
    </Toolbar>
  )
}

// Arrow: pull one from a thing to another, or to a point of its own. The line is for the next arrow.
export function ArrowTool({ state, dispatch }: Common) {
  return (
    <Toolbar title="Arrow">
      <Toggle state={state} dispatch={dispatch} tool="connector" label="Arrow" icon={RoutingIcon} />
      <Options show={state.tool === 'connector'}>
        <span className="boardtool__styles" role="radiogroup" aria-label="Line of the next arrow">
          {CONNECTOR_STYLES.map((style) => (
            <button key={style} type="button" role="radio" className="boardtool__style" aria-checked={state.connectorStyle === style} onClick={() => dispatch({ type: 'set_connector_style', style })}>
              {CONNECTOR_STYLE_LABELS[style]}
            </button>
          ))}
        </span>
      </Options>
    </Toolbar>
  )
}

// What a template looks like, drawn small: its frames, in the shape and the places they will be.
function Preview({ template }: { template: TemplateDef }) {
  return (
    <span className="templates__preview" aria-hidden="true" style={{ aspectRatio: `${template.size.w} / ${template.size.h}` }}>
      {framesOf(template).map((frame) => (
        <i key={frame.id} style={{ left: `${(frame.x / template.size.w) * 100}%`, top: `${(frame.y / template.size.h) * 100}%`, width: `${(frame.w / template.size.w) * 100}%`, height: `${(frame.h / template.size.h) * 100}%` }} />
      ))}
    </span>
  )
}

// Templates: a starting layout for a kind of thinking, put on the board near the middle of the view for the founder to fill in and change.
// Every part of one can be written in, moved, resized, recoloured and deleted, as anything on the board can.
export function TemplatesTool({ boardRef }: { boardRef: RefObject<BoardHandle | null> }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, wrapRef)

  return (
    <Toolbar title="Templates">
      <div className="templates" ref={wrapRef}>
        <BarButton icon={LayersMinimalisticIcon} label="Templates" onClick={() => setOpen((value) => !value)} menu={{ expanded: open, controls: menuId }} />
        <AnimatePresence>
          {open && (
            <motion.div
              id={menuId}
              className="templates__menu glass glass--strong"
              role="menu"
              aria-label="Templates"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  role="menuitem"
                  className="templates__item"
                  onClick={() => {
                    setOpen(false)
                    boardRef.current?.addTemplate(template.id)
                  }}
                >
                  <Preview template={template} />
                  <span className="templates__text">
                    <span className="templates__name">{template.name}</span>
                    <span className="templates__summary">{template.summary}</span>
                  </span>
                </button>
              ))}
              <p className="templates__note">It is put near the middle of the view, in the nearest clear space. Everything in it can be changed.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Toolbar>
  )
}
