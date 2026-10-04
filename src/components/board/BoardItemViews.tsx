import { type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject, useId } from 'react'
import { BOARD_H, BOARD_W, type Point } from '../../lib/boardGeometry.ts'
import { connectorPath } from '../../lib/boardConnectors.ts'
import {
  MAX_LABEL,
  MAX_NOTE_TEXT,
  MAX_TEXT,
  MAX_TITLE,
  describeItem,
  type BoardItem,
  type ConnectorItem,
  type FrameItem,
  type NoteItem,
  type ShapeItem,
  type TextItem,
} from '../../lib/boardTypes.ts'

// How each kind of thing on the board is drawn. They draw what they are given (the interface decides where a thing is while it is carried,
// and whether it is selected or being written in) and say what happened through the callbacks.

export type ViewProps<T extends BoardItem> = {
  item: T
  // All the items as they are drawn now, for the words an arrow's description needs.
  items: BoardItem[]
  selected: boolean
  editing: boolean
  dragging: boolean
  resizing: boolean
  // A handle to resize it, shown on a single selected thing.
  resizable: boolean
  onFocus: () => void
  onEdit: () => void
  onStopEditing: () => void
  onText: (text: string) => void
  onResizeDown: (event: PointerEvent<HTMLElement>) => void
}

const flags = (props: ViewProps<BoardItem>) => ({
  'data-selected': props.selected || undefined,
  'data-dragging': props.dragging || undefined,
  'data-resizing': props.resizing || undefined,
})

// A text field for the words of a thing. Escape stops writing, and a press inside it is never the start of a drag.
function Writing({ className, label, value, max, hint, onChange, onDone }: { className: string; label: string; value: string; max: number; hint?: string; onChange: (value: string) => void; onDone: () => void }) {
  return (
    <textarea
      className={className}
      aria-label={label}
      value={value}
      maxLength={max}
      placeholder={hint}
      autoFocus
      onFocus={(event) => event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onDone}
      onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          event.currentTarget.blur()
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
    />
  )
}

const ResizeHandle = ({ onPointerDown }: { onPointerDown: (event: PointerEvent<HTMLElement>) => void }) => (
  <span className="resize-handle" role="presentation" title="Drag to resize. Alt with an arrow key also resizes." onPointerDown={onPointerDown} />
)

function Shell({ props, className, children }: { props: ViewProps<NoteItem | ShapeItem | TextItem>; className: string; children: ReactNode }) {
  const { item } = props
  return (
    <div
      className={className}
      data-item-id={item.id}
      data-kind={item.kind}
      data-colour={'colour' in item ? item.colour : undefined}
      data-guide={item.hint && !item.text.trim() ? '' : undefined}
      {...flags(props)}
      role="group"
      tabIndex={0}
      aria-roledescription={item.kind === 'note' ? 'sticky note' : item.kind === 'shape' ? 'shape' : 'text'}
      aria-label={describeItem(item, props.items)}
      aria-selected={props.selected}
      style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
      onFocus={props.onFocus}
      onDoubleClick={(event) => {
        event.stopPropagation()
        props.onEdit()
      }}
    >
      {children}
    </div>
  )
}

export function NoteView(props: ViewProps<NoteItem>) {
  const { item, editing } = props
  return (
    <Shell props={props} className="note">
      <div className="item-text">
        {editing ? (
          <Writing className="item-text__field" label="Note text" value={item.text} max={MAX_NOTE_TEXT} hint={item.hint} onChange={props.onText} onDone={props.onStopEditing} />
        ) : (
          item.text || <span className="item-text__placeholder">{item.hint ?? 'Double-click to write'}</span>
        )}
      </div>
      {item.author === 'ai' && <span className="note__author">Droplet</span>}
      {props.resizable && !editing && <ResizeHandle onPointerDown={props.onResizeDown} />}
    </Shell>
  )
}

export function ShapeView(props: ViewProps<ShapeItem>) {
  const { item, editing } = props
  return (
    <Shell props={props} className="shape">
      {item.shape === 'diamond' ? (
        <svg className="shape__body shape__body--diamond" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" data-colour={item.colour}>
          <polygon points="50,1 99,50 50,99 1,50" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : (
        <div className="shape__body" data-shape={item.shape} data-colour={item.colour} aria-hidden="true" />
      )}
      <div className="shape__text" data-shape={item.shape}>
        {editing ? (
          <Writing className="item-text__field item-text__field--centred" label="Shape text" value={item.text} max={MAX_TEXT} hint={item.hint} onChange={props.onText} onDone={props.onStopEditing} />
        ) : (
          item.text || <span className="item-text__placeholder">{item.hint ?? 'Double-click to write'}</span>
        )}
      </div>
      {props.resizable && !editing && <ResizeHandle onPointerDown={props.onResizeDown} />}
    </Shell>
  )
}

export function TextLabelView(props: ViewProps<TextItem>) {
  const { item, editing } = props
  return (
    <Shell props={props} className="textitem">
      <div className="textitem__text" data-size={item.size}>
        {editing ? (
          <Writing className="item-text__field" label="Text" value={item.text} max={MAX_TEXT} hint={item.hint} onChange={props.onText} onDone={props.onStopEditing} />
        ) : (
          item.text || <span className="item-text__placeholder">{item.hint ?? 'Double-click to write'}</span>
        )}
      </div>
      {props.resizable && !editing && <ResizeHandle onPointerDown={props.onResizeDown} />}
    </Shell>
  )
}

// A frame is a labelled area. Its inside is not drawn as something to press, so a press there is a press on the board (a box to select with,
// or a place for a new note), and only its title and its border are the frame's to grab.
export function FrameView(props: ViewProps<FrameItem> & { onTitle: (title: string) => void }) {
  const { item, editing } = props
  return (
    <div
      className="frame"
      data-item-id={item.id}
      data-kind="frame"
      data-colour={item.colour}
      {...flags(props)}
      role="group"
      tabIndex={0}
      aria-roledescription="frame"
      aria-label={describeItem(item, props.items)}
      aria-selected={props.selected}
      style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
      onFocus={props.onFocus}
    >
      <span className="frame__edge frame__edge--top" />
      <span className="frame__edge frame__edge--right" />
      <span className="frame__edge frame__edge--bottom" />
      <span className="frame__edge frame__edge--left" />
      {editing ? (
        <input
          className="frame__title frame__title--editing"
          aria-label="Frame title"
          value={item.title}
          maxLength={MAX_TITLE}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => props.onTitle(event.target.value)}
          onBlur={props.onStopEditing}
          onKeyDown={(event) => {
            if (event.key === 'Escape' || event.key === 'Enter') {
              event.stopPropagation()
              event.currentTarget.blur()
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
        />
      ) : (
        <span className="frame__title" onDoubleClick={(event) => { event.stopPropagation(); props.onEdit() }}>
          {item.title || <span className="item-text__placeholder">Untitled</span>}
        </span>
      )}
      {props.resizable && !editing && <ResizeHandle onPointerDown={props.onResizeDown} />}
    </div>
  )
}

// ---- Arrows ----

const pathData = (points: Point[]) => points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

type ConnectorsProps = {
  connectors: ConnectorItem[]
  // All the items as drawn now, which is where the arrows run between.
  items: BoardItem[]
  selection: string[]
  editing: string | null
  // An arrow being drawn, or one of whose ends is being moved: drawn dashed, and where it is going is lit.
  draft: ConnectorItem | null
  // The thing the end being carried would land on.
  target: string | null
  onFocus: (id: string) => void
  onEdit: (id: string) => void
  onStopEditing: () => void
  onLabel: (id: string, text: string) => void
  onHandleDown: (event: PointerEvent<SVGElement>, id: string, end: 'from' | 'to') => void
  // Which arrow is selected alone, which is the one whose ends can be moved.
  handlesFor: string | null
  labelRef?: RefObject<HTMLInputElement | null>
}

// All the arrows, in one layer between the frames and the things. Each is a line you can press (wider than it is drawn, so it is easy to
// hit) with its arrowheads, and a label on it if it has one.
export function ConnectorsLayer({ connectors, items, selection, editing, draft, target, onFocus, onEdit, onStopEditing, onLabel, onHandleDown, handlesFor }: ConnectorsProps) {
  const uid = useId().replace(/:/g, '')
  const head = (selected: boolean) => `url(#${uid}-${selected ? 'head-on' : 'head'})`
  const drawn = connectors.map((connector) => ({ connector, path: connectorPath(connector, items) })).filter((entry): entry is { connector: ConnectorItem; path: NonNullable<typeof entry.path> } => entry.path !== null)
  const draftPath = draft ? connectorPath(draft, items) : null
  const handlesPath = handlesFor ? (draft && draft.id === handlesFor ? draftPath : drawn.find((entry) => entry.connector.id === handlesFor)?.path) : null

  return (
    <>
      <svg className="connectors" width={BOARD_W} height={BOARD_H} viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}>
        <defs>
          {[false, true].map((on) => (
            <marker key={String(on)} id={`${uid}-${on ? 'head-on' : 'head'}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className={on ? 'connectors__head connectors__head--on' : 'connectors__head'} />
            </marker>
          ))}
        </defs>
        {drawn.map(({ connector, path }) => {
          const selected = selection.includes(connector.id)
          return (
            <g
              key={connector.id}
              className="connector"
              data-item-id={connector.id}
              data-kind="connector"
              data-selected={selected || undefined}
              role="group"
              tabIndex={0}
              aria-roledescription="arrow"
              aria-label={describeItem(connector, items)}
              aria-selected={selected}
              onFocus={() => onFocus(connector.id)}
              onDoubleClick={(event) => {
                event.stopPropagation()
                onEdit(connector.id)
              }}
            >
              <path className="connector__hit" d={pathData(path.points)} />
              <path
                className="connector__line"
                d={pathData(path.points)}
                markerEnd={connector.head !== 'none' ? head(selected) : undefined}
                markerStart={connector.head === 'both' ? head(selected) : undefined}
              />
            </g>
          )
        })}
        {draft && draftPath && <path className="connector__line connector__line--draft" d={pathData(draftPath.points)} markerEnd={head(true)} />}
        {handlesPath &&
          (['from', 'to'] as const).map((end) => {
            const point = end === 'from' ? handlesPath.points[0] : handlesPath.points[handlesPath.points.length - 1]
            return <circle key={end} className="connector__handle" cx={point.x} cy={point.y} r={11} data-end={end} onPointerDown={(event) => onHandleDown(event, handlesFor!, end)}><title>{end === 'from' ? 'Drag to move the start of the arrow' : 'Drag to move the end of the arrow'}</title></circle>
          })}
      </svg>
      {target && <ConnectTarget items={items} id={target} />}
      {drawn.map(({ connector, path }) => {
        if (!connector.text && editing !== connector.id) return null
        return (
          <div key={connector.id} className="connector__label" data-item-id={connector.id} data-selected={selection.includes(connector.id) || undefined} style={{ left: path.label.x, top: path.label.y }}>
            {editing === connector.id ? (
              <input
                className="connector__label-field"
                aria-label="Arrow label"
                value={connector.text}
                maxLength={MAX_LABEL}
                autoFocus
                onChange={(event) => onLabel(connector.id, event.target.value)}
                onBlur={onStopEditing}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' || event.key === 'Enter') {
                    event.stopPropagation()
                    event.currentTarget.blur()
                  }
                }}
                onPointerDown={(event) => event.stopPropagation()}
              />
            ) : (
              connector.text
            )}
          </div>
        )
      })}
    </>
  )
}

// The outline round the thing an arrow's end would land on, while the end is carried.
function ConnectTarget({ items, id }: { items: BoardItem[]; id: string }) {
  const item = items.find((other) => other.id === id)
  if (!item || item.kind === 'connector') return null
  return <div className="connect-target" aria-hidden="true" style={{ left: item.x, top: item.y, width: item.w, height: item.h }} />
}
