import { useState, type CSSProperties } from 'react'
import { newId } from '../../lib/ids.ts'
import { AltArrowDownIcon, AltArrowUpIcon, LinkRoundIcon, StarIcon, TrashBinMinimalisticIcon } from '@solar-icons/react/linear'
import {
  CONNECTOR_HEADS,
  CONNECTOR_HEAD_LABELS,
  CONNECTOR_STYLES,
  CONNECTOR_STYLE_LABELS,
  COLOUR_LABELS,
  FOUNDER_COLOURS,
  SHAPE_COLOURS,
  SHAPE_KINDS,
  SHAPE_LABELS,
  TEXT_SIZES,
  TEXT_SIZE_LABELS,
  isFrame,
  isNode,
  type BoardItem,
  type ConnectorItem,
  type ShapeItem,
  type TextItem,
} from '../../lib/boardTypes.ts'
import type { BoardAction } from '../../lib/boardState.ts'
import type { ProjectMemory } from '../../lib/memorySave.ts'
import { boardSuggestions } from '../../lib/inlineAi.ts'
import AskDroplet from '../AskDroplet.tsx'
import { IDEA_LIMITS, ideaFits, ideaStatus, ideaText, type IdeaKind } from '../../lib/projectMemory.ts'

// What lets a founder decide a name or an offer from the board: what the project remembers now, and a way to remember words. Nothing is
// remembered until the founder presses the confirm that this bar shows.
export type Decide = { memory: ProjectMemory; remember: (kind: IdeaKind, text: string) => void; forget: (kind: IdeaKind) => void }

const IDEA_WORDS: Record<IdeaKind, { button: string; what: string }> = {
  name: { button: 'Use as business name', what: 'the business name' },
  offer: { button: 'Use as offer', what: 'the offer' },
}

type Props = {
  selected: BoardItem[]
  // How many things are inside the frames that are selected, and would be taken with them.
  held: number
  dispatch: (action: BoardAction) => void
  say: (text: string) => void
  style: CSSProperties
  // Set when everything selected is from one use of a template: its name, and a way to put it back as it was.
  template?: { name: string; reset: () => void } | null
  decide?: Decide
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

// The bar over the selection. What is on it depends on what is selected: colours for notes, shapes and frames, the kind of a shape, the size
// of text, how an arrow is drawn, a way to join two things with an arrow, a place in the order, and delete. Everything here is also
// possible with the keyboard.
export default function SelectionBar({ selected, held, dispatch, say, style, template, decide }: Props) {
  const ids = selected.map((item) => item.id)
  const [asking, setAsking] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [deciding, setDeciding] = useState<IdeaKind | null>(null)
  const only = (kind: BoardItem['kind']) => selected.length > 0 && selected.every((item) => item.kind === kind)

  const notes = only('note')
  const shapes = only('shape')
  const texts = only('text')
  const arrows = only('connector')
  const hasFrame = selected.some(isFrame)
  // Colour: a note chooses from the notes' colours, and anything else that has a colour from white and those. Text and arrows have none.
  const coloured = selected.every((item) => item.kind === 'note' || item.kind === 'shape' || item.kind === 'frame')
  const colours = notes ? FOUNDER_COLOURS : SHAPE_COLOURS
  const connectable = selected.length === 2 && selected.every((item) => isNode(item) || isFrame(item))
  const frames = selected.filter(isFrame)
  // Notes by Droplet in the selection, which the founder can keep as their own.
  const droplets = selected.filter((item) => item.kind === 'note' && item.author === 'ai')

  // The words of the one thing selected, when it holds words that could be a name or an offer.
  const only1 = selected.length === 1 ? selected[0] : null
  const words = only1 && (only1.kind === 'note' || only1.kind === 'shape' || only1.kind === 'text') ? ideaText(only1.text) : ''

  // Notes, shapes and text can be kept in mind. A frame only holds them, and an arrow has no words.
  const keepable = selected.length > 0 && selected.every((item) => item.kind === 'note' || item.kind === 'shape' || item.kind === 'text')
  const starred = keepable && selected.every((item) => item.starred)

  const pressed = (colour: string) => selected.every((item) => 'colour' in item && item.colour === colour)

  return (
    <div className="board__bar glass glass--strong" role="toolbar" aria-label="Selected" style={style} onPointerDown={(event) => event.stopPropagation()}>
      {coloured && (
        <span className="board__colours" role="group" aria-label="Colour">
          {colours.map((colour) => (
            <button key={colour} type="button" className="board__colour" data-colour={colour} aria-label={COLOUR_LABELS[colour]} aria-pressed={pressed(colour)} onClick={() => dispatch({ type: 'set_colour', ids, colour })} />
          ))}
        </span>
      )}

      {shapes && (
        <span className="board__choices" role="group" aria-label="Shape">
          {SHAPE_KINDS.map((kind) => (
            <button key={kind} type="button" className="board__choice board__choice--shape" data-shape={kind} aria-label={SHAPE_LABELS[kind]} aria-pressed={selected.every((item) => (item as ShapeItem).shape === kind)} onClick={() => dispatch({ type: 'set_shape', ids, shape: kind })}>
              <span aria-hidden="true" />
            </button>
          ))}
        </span>
      )}

      {texts && (
        <span className="board__choices" role="group" aria-label="Size">
          {TEXT_SIZES.map((size) => (
            <button key={size} type="button" className="board__choice board__choice--word" aria-pressed={selected.every((item) => (item as TextItem).size === size)} onClick={() => dispatch({ type: 'set_text_size', ids, size })}>
              {TEXT_SIZE_LABELS[size]}
            </button>
          ))}
        </span>
      )}

      {arrows && (
        <>
          <span className="board__choices" role="group" aria-label="Line">
            {CONNECTOR_STYLES.map((style) => (
              <button key={style} type="button" className="board__choice board__choice--word" aria-pressed={selected.every((item) => (item as ConnectorItem).style === style)} onClick={() => selected.forEach((item) => dispatch({ type: 'set_connector', id: item.id, patch: { style } }))}>
                {CONNECTOR_STYLE_LABELS[style]}
              </button>
            ))}
          </span>
          <span className="board__choices" role="group" aria-label="Arrowheads">
            {CONNECTOR_HEADS.map((head) => (
              <button key={head} type="button" className="board__choice board__choice--word" aria-label={CONNECTOR_HEAD_LABELS[head]} aria-pressed={selected.every((item) => (item as ConnectorItem).head === head)} onClick={() => selected.forEach((item) => dispatch({ type: 'set_connector', id: item.id, patch: { head } }))}>
                {head === 'end' ? '→' : head === 'both' ? '↔' : '—'}
              </button>
            ))}
          </span>
        </>
      )}

      {droplets.length > 0 && (
        <button
          type="button"
          className="board__small"
          onClick={() => {
            dispatch({ type: 'keep_notes', ids: droplets.map((item) => item.id) })
            say(droplets.length === 1 ? 'Kept the note as yours.' : `Kept ${droplets.length} notes as yours.`)
          }}
        >
          {droplets.length === 1 ? 'Keep as mine' : `Keep ${droplets.length} as mine`}
        </button>
      )}

      {decide && words !== '' &&
        (deciding ? (
          <span className="board__ask" role="group" aria-label={`Remember this as ${IDEA_WORDS[deciding].what}?`}>
            <span>
              {ideaStatus(decide.memory, deciding, words) === 'same' ? `“${words}” is already remembered as ${IDEA_WORDS[deciding].what}.` : `Remember “${words}” as ${IDEA_WORDS[deciding].what}?`}
              {deciding === 'name' && ideaStatus(decide.memory, deciding, words) !== 'same' ? ' It is also the business name on invoices.' : ''}
              {ideaStatus(decide.memory, deciding, words) === 'updated' ? ` This replaces “${decide.memory.idea?.[deciding]}”.` : ''}
            </span>
            {ideaStatus(decide.memory, deciding, words) === 'same' ? (
              <button
                type="button"
                className="board__small board__small--danger"
                onClick={() => {
                  decide.forget(deciding)
                  say(`Forgot ${IDEA_WORDS[deciding].what}.`)
                  setDeciding(null)
                }}
              >
                Forget it
              </button>
            ) : (
              <button
                type="button"
                className="board__small"
                onClick={() => {
                  decide.remember(deciding, words)
                  say(`Remembered ${IDEA_WORDS[deciding].what}.`)
                  setDeciding(null)
                }}
              >
                Remember
              </button>
            )}
            <button type="button" className="board__small" onClick={() => setDeciding(null)}>
              Cancel
            </button>
          </span>
        ) : (
          (['name', 'offer'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className="board__small"
              disabled={!ideaFits(kind, words)}
              title={ideaFits(kind, words) ? undefined : `Too long for ${IDEA_WORDS[kind].what}: ${IDEA_LIMITS[kind]} characters at most.`}
              onClick={() => setDeciding(kind)}
            >
              {IDEA_WORDS[kind].button}
            </button>
          ))
        ))}

      <AskDroplet
        suggestions={boardSuggestions(selected)}
        label={selected.length === 1 ? (isFrame(selected[0]) ? 'Ask Droplet about this frame' : 'Ask Droplet about this note') : 'Ask Droplet about these notes'}
      />

      {connectable && (
        <button
          type="button"
          className="board__icon"
          aria-label="Join the two with an arrow"
          title="Join the two with an arrow"
          onClick={() => {
            dispatch({ type: 'add_connector', id: newId(), from: { item: selected[0].id }, to: { item: selected[1].id } })
            say('Joined them with an arrow.')
          }}
        >
          <LinkRoundIcon size={18} aria-hidden="true" />
        </button>
      )}

      {keepable && (
        <button type="button" className="board__icon" aria-label="Keep in mind" aria-pressed={starred} title="Keep in mind: Droplet's notes on this project always include it" onClick={() => dispatch({ type: 'set_starred', ids, starred: !starred })}>
          <StarIcon size={18} aria-hidden="true" />
        </button>
      )}

      <span className="board__choices" role="group" aria-label="Order">
        <button type="button" className="board__icon" aria-label="Bring forward" title="Bring forward" onClick={() => dispatch({ type: 'reorder', ids, to: 'forward' })}>
          <AltArrowUpIcon size={18} aria-hidden="true" />
        </button>
        <button type="button" className="board__icon" aria-label="Send backward" title="Send backward" onClick={() => dispatch({ type: 'reorder', ids, to: 'backward' })}>
          <AltArrowDownIcon size={18} aria-hidden="true" />
        </button>
      </span>

      {template &&
        (resetting ? (
          <span className="board__ask" role="group" aria-label={`Reset the ${template.name} template?`}>
            <span>Reset the {template.name} template? What you wrote in it goes.</span>
            <button type="button" className="board__small board__small--danger" onClick={() => { template.reset(); setResetting(false) }}>
              Reset
            </button>
            <button type="button" className="board__small" onClick={() => setResetting(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="board__small" onClick={() => setResetting(true)}>
            Reset template
          </button>
        ))}

      {hasFrame && held > 0 ? (
        asking ? (
          <span className="board__ask" role="group" aria-label={`Delete the frame and ${plural(held, 'thing', 'things')} in it?`}>
            <span>Delete the frame and {plural(held, 'thing', 'things')} in it?</span>
            <button type="button" className="board__small board__small--danger" onClick={() => { dispatch({ type: 'delete', ids, contents: true }); say(`Deleted the frame and ${plural(held, 'thing', 'things')} in it.`); setAsking(false) }}>
              Delete all
            </button>
            <button type="button" className="board__small" onClick={() => setAsking(false)}>
              Keep
            </button>
          </span>
        ) : (
          <>
            <button type="button" className="board__small" onClick={() => { dispatch({ type: 'delete', ids }); say(`Deleted ${frames.length === 1 ? 'the frame' : 'the frames'}. What was inside ${frames.length === 1 ? 'it stays' : 'them stays'} on the board.`) }}>
              Delete {frames.length === 1 && selected.length === 1 ? 'frame' : 'frames'}
            </button>
            <button type="button" className="board__small" onClick={() => setAsking(true)}>
              Delete with contents
            </button>
          </>
        )
      ) : (
        <button
          type="button"
          className="board__icon"
          aria-label={selected.length === 1 ? 'Delete' : `Delete ${selected.length} things`}
          title="Delete"
          onClick={() => { dispatch({ type: 'delete', ids }); say(`Deleted ${plural(selected.length, 'thing', 'things')}.`) }}
        >
          <TrashBinMinimalisticIcon size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

