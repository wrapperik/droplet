import { useCallback, useEffect, useRef, useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { docOf, openBoard, reduceBoard, type BoardAction, type BoardItem, type NoteItem } from '../../lib/boardState.ts'
import BoardCanvas, { type BoardHandle } from './BoardCanvas.tsx'
import type { Decide } from './SelectionBar.tsx'
import { emptyMemory, withIdea } from '../../lib/projectMemory.ts'
import { ArrowTool, FrameTool, SelectTool, ShapeTool, StickyTool, TemplatesTool, TextTool } from './BoardTools.tsx'
import { TEMPLATES, templateById } from '../../lib/boardTemplates.ts'
import { intersects } from '../../lib/boardGeometry.ts'
import { isFrame, isRectItem, rectOf } from '../../lib/boardTypes.ts'

const note = (id: string, x: number, y: number, extra: Partial<NoteItem> = {}): NoteItem => ({ id, kind: 'note', x, y, w: 200, h: 180, text: id, colour: 'yellow', author: 'you', ...extra })

// The board wired to the real reducer, as the workspace does, with the tools beside it. In a test nothing has a size, so the board sits at
// the top-left of the page and a point on the screen is a point on the board divided by the zoom (the zoom starts at 50 percent).
let latestState: ReturnType<typeof openBoard>
const shape = (id: string, x: number, y: number, kind: 'rectangle' | 'rounded' | 'ellipse' | 'diamond' = 'rectangle'): BoardItem => ({ id, kind: 'shape', shape: kind, x, y, w: 200, h: 140, text: id, colour: 'white' })
const frame = (id: string, x: number, y: number, w = 800, h = 600, title = 'Frame'): BoardItem => ({ id, kind: 'frame', x, y, w, h, title, colour: 'white' })
const arrow = (id: string, from: string, to: string): BoardItem => ({ id, kind: 'connector', from: { item: from }, to: { item: to }, style: 'straight', head: 'end', text: '' })
function Harness({ items = [], decide }: { items?: BoardItem[]; decide?: Decide }) {
  const [state, setState] = useState(() => openBoard(items))
  useEffect(() => {
    latestState = state
  })
  const dispatch = useCallback((action: BoardAction) => setState((current) => reduceBoard(current, action)), [])
  const ref = useRef<BoardHandle | null>(null)
  return (
    <>
      <SelectTool state={state} dispatch={dispatch} />
      <StickyTool state={state} dispatch={dispatch} boardRef={ref} />
      <ShapeTool state={state} dispatch={dispatch} boardRef={ref} />
      <TextTool state={state} dispatch={dispatch} boardRef={ref} />
      <FrameTool state={state} dispatch={dispatch} boardRef={ref} />
      <ArrowTool state={state} dispatch={dispatch} />
      <TemplatesTool boardRef={ref} />
      <button type="button" onClick={() => dispatch({ type: 'undo' })}>
        Undo
      </button>
      <BoardCanvas state={state} dispatch={dispatch} reason="Why." controlRef={ref} decide={decide} />
    </>
  )
}

// The options of a tool (its colours, its kinds, its plus) are there only while it is in hand, so the tool is put in hand first, if it is not.
const inHand = async (user: ReturnType<typeof userEvent.setup>, tool: 'Note' | 'Shape' | 'Text' | 'Frame' | 'Arrow') => {
  const button = screen.getByRole('button', { name: tool })
  if (button.getAttribute('aria-pressed') !== 'true') await user.click(button)
}

const noteEl = (id: string) => document.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!
const position = (id: string) => ({ left: parseFloat(noteEl(id).style.left), top: parseFloat(noteEl(id).style.top) })
const surface = () => document.querySelector<HTMLElement>('.board__surface')!
const itemEl = (id: string) => document.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!
const arrowEls = () => [...document.querySelectorAll<SVGElement>('[data-kind="connector"]')]
const pull = async (user: ReturnType<typeof userEvent.setup>, target: Element, from: [number, number], to: [number, number]) => {
  await user.pointer([{ keys: '[MouseLeft>]', target, coords: { clientX: from[0], clientY: from[1] } }, { coords: { clientX: to[0], clientY: to[1] } }, { keys: '[/MouseLeft]' }])
}
const viewport = () => screen.getByRole('group', { name: /^Board\./ })
const items = () => docOf(latestState).items as NoteItem[]
const everything = () => docOf(latestState).items

describe('the board', () => {
  it('has a window of its own with a reason, and a view that can be scrolled', () => {
    render(<Harness />)
    expect(screen.getByRole('region', { name: 'Board' })).toBeInTheDocument()
    expect(viewport()).toBeInTheDocument()
  })

  it('draws its notes, with the words on them, and says who wrote the ones by Droplet in words as well as in pink', () => {
    render(<Harness items={[note('a', 400, 400, { text: 'Gift boxes' }), note('b', 800, 400, { text: 'An idea', colour: 'pink', author: 'ai' })]} />)
    expect(noteEl('a')).toHaveTextContent('Gift boxes')
    expect(noteEl('a')).toHaveAttribute('data-colour', 'yellow')
    expect(noteEl('b')).toHaveAttribute('data-colour', 'pink')
    expect(within(noteEl('b')).getByText('Droplet')).toBeInTheDocument()
    expect(within(noteEl('a')).queryByText('Droplet')).not.toBeInTheDocument()
    expect(noteEl('b')).toHaveAccessibleName('An idea, written by Droplet')
  })

  it('shows a note with nothing on it as empty, with a hint', () => {
    render(<Harness items={[note('a', 400, 400, { text: '' })]} />)
    expect(noteEl('a')).toHaveAccessibleName('Empty note')
    expect(within(noteEl('a')).getByText('Double-click to write')).toBeInTheDocument()
  })
})

describe('selecting', () => {
  it('selects a note when it is pressed, and shows the bar for it', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 800, 400)]} />)
    await user.click(noteEl('a'))
    expect(noteEl('a')).toHaveAttribute('aria-selected', 'true')
    expect(noteEl('b')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('toolbar', { name: 'Selected' })).toBeInTheDocument()
  })

  it('selects only the one pressed, and adds to the selection with shift', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 800, 400)]} />)
    await user.click(noteEl('a'))
    await user.click(noteEl('b'))
    expect(latestState.selection).toEqual(['b'])
    await user.keyboard('{Shift>}')
    await user.click(noteEl('a'))
    await user.keyboard('{/Shift}')
    expect(latestState.selection.sort()).toEqual(['a', 'b'])
    expect(screen.getByRole('button', { name: 'Delete 2 things' })).toBeInTheDocument()
  })

  it('clears the selection when the empty board is pressed', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400)]} />)
    await user.click(noteEl('a'))
    await user.click(surface())
    expect(latestState.selection).toEqual([])
    expect(screen.queryByRole('toolbar', { name: 'Selected' })).not.toBeInTheDocument()
  })

  it('selects every note with Ctrl or Cmd and A, and clears with Escape', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 800, 400)]} />)
    viewport().focus()
    await user.keyboard('{Control>}a{/Control}')
    expect(latestState.selection).toHaveLength(2)
    await user.keyboard('{Escape}')
    expect(latestState.selection).toEqual([])
  })

  it('draws a box on the empty board that selects what it touches', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 100, 100), note('b', 2000, 2000)]} />)
    // at 50 percent a screen point is half a board point: this box covers 0 to 800 on the board
    await user.pointer([{ keys: '[MouseLeft>]', target: surface(), coords: { clientX: 2, clientY: 2 } }, { coords: { clientX: 400, clientY: 400 } }, { keys: '[/MouseLeft]' }])
    expect(latestState.selection).toEqual(['a'])
  })

  it('adds to the selection with a box when shift is held', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 100, 100), note('b', 2000, 2000)]} />)
    await user.click(noteEl('b'))
    await user.keyboard('{Shift>}')
    await user.pointer([{ keys: '[MouseLeft>]', target: surface(), coords: { clientX: 2, clientY: 2 } }, { coords: { clientX: 400, clientY: 400 } }, { keys: '[/MouseLeft]' }])
    await user.keyboard('{/Shift}')
    expect(latestState.selection.sort()).toEqual(['a', 'b'])
  })
})

describe('moving', () => {
  it('moves a note with the pointer, snapped, as one step, and takes it back with undo', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400)]} />)
    // 100 screen pixels at 50 percent is 200 on the board
    await user.pointer([{ keys: '[MouseLeft>]', target: noteEl('a'), coords: { clientX: 300, clientY: 300 } }, { coords: { clientX: 400, clientY: 360 } }, { keys: '[/MouseLeft]' }])
    expect(position('a')).toEqual({ left: 600, top: 520 })
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(position('a')).toEqual({ left: 400, top: 400 })
  })

  it('shows the note where it will land while it is carried, and moves nothing until it is let go', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400)]} />)
    await user.pointer([{ keys: '[MouseLeft>]', target: noteEl('a'), coords: { clientX: 300, clientY: 300 } }, { coords: { clientX: 400, clientY: 300 } }])
    expect(position('a').left).toBe(600)
    expect(items()[0].x).toBe(400)
    expect(noteEl('a')).toHaveAttribute('data-dragging')
    await user.pointer({ keys: '[/MouseLeft]' })
    expect(items()[0].x).toBe(600)
  })

  it('does not move a note that was only pressed, or moved less than a few pixels', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400)]} />)
    await user.pointer([{ keys: '[MouseLeft>]', target: noteEl('a'), coords: { clientX: 300, clientY: 300 } }, { coords: { clientX: 302, clientY: 301 } }, { keys: '[/MouseLeft]' }])
    expect(items()[0].x).toBe(400)
  })

  it('moves every selected note together', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 1000, 400)]} />)
    viewport().focus()
    await user.keyboard('{Control>}a{/Control}')
    await user.pointer([{ keys: '[MouseLeft>]', target: noteEl('a'), coords: { clientX: 300, clientY: 300 } }, { coords: { clientX: 350, clientY: 300 } }, { keys: '[/MouseLeft]' }])
    expect(position('a').left).toBe(500)
    expect(position('b').left).toBe(1100)
  })

  it('cannot be carried off the board', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 40, 40)]} />)
    await user.pointer([{ keys: '[MouseLeft>]', target: noteEl('a'), coords: { clientX: 300, clientY: 300 } }, { coords: { clientX: 0, clientY: 0 } }, { keys: '[/MouseLeft]' }])
    expect(position('a')).toEqual({ left: 0, top: 0 })
  })

  it('gives the move up on Escape', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400)]} />)
    await user.pointer([{ keys: '[MouseLeft>]', target: noteEl('a'), coords: { clientX: 300, clientY: 300 } }, { coords: { clientX: 500, clientY: 300 } }])
    await user.keyboard('{Escape}')
    await user.pointer({ keys: '[/MouseLeft]' })
    expect(items()[0].x).toBe(400)
    expect(position('a').left).toBe(400)
  })

  it('moves with the arrow keys, a grid step at a time, and a bigger step with shift', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400)]} />)
    await user.click(noteEl('a'))
    await user.keyboard('{ArrowRight}{ArrowDown}')
    expect(items()[0]).toMatchObject({ x: 420, y: 420 })
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    expect(items()[0].x).toBe(320)
    expect(screen.getByRole('status')).toHaveTextContent('Moved 1 thing.')
  })

  it('says when a note is already at the edge of the board', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 0, 0)]} />)
    await user.click(noteEl('a'))
    await user.keyboard('{ArrowLeft}')
    expect(items()[0].x).toBe(0)
    expect(screen.getByRole('status')).toHaveTextContent('That is the edge of the board.')
  })
})

describe('writing', () => {
  it('writes in a note on Enter, and goes back to the note on Escape', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400, { text: '' })]} />)
    await user.click(noteEl('a'))
    await user.keyboard('{Enter}')
    const field = screen.getByRole('textbox', { name: 'Note text' })
    expect(field).toHaveFocus()
    await user.keyboard('Corporate gifts')
    expect(items()[0].text).toBe('Corporate gifts')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(noteEl('a')).toHaveTextContent('Corporate gifts')
  })

  it('writes in a note when it is double-clicked, with the cursor at the end of what is there', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400, { text: 'Start' })]} />)
    await user.dblClick(noteEl('a'))
    await user.keyboard(' more')
    expect(items()[0].text).toBe('Start more')
  })

  it('is one step for everything typed in one note', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400, { text: '' })]} />)
    await user.dblClick(noteEl('a'))
    await user.keyboard('hello')
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(items()[0].text).toBe('')
  })

  it('does not delete the note when Delete or Backspace is pressed while writing in it', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400, { text: 'abc' })]} />)
    await user.dblClick(noteEl('a'))
    await user.keyboard('{Backspace}{Delete}')
    expect(items()).toHaveLength(1)
    expect(items()[0].text).toBe('ab')
  })

  it('does not take a pointer press inside the note being written in for a drag', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400, { text: 'abc' })]} />)
    await user.dblClick(noteEl('a'))
    await user.pointer([{ keys: '[MouseLeft>]', target: screen.getByRole('textbox'), coords: { clientX: 300, clientY: 300 } }, { coords: { clientX: 500, clientY: 300 } }, { keys: '[/MouseLeft]' }])
    expect(items()[0].x).toBe(400)
  })
})

describe('adding notes', () => {
  it('adds a note where the empty board is double-clicked, and writes in it at once', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    fireEvent.doubleClick(surface(), { clientX: 1000, clientY: 600 })
    // 1000 by 600 on the screen is 2000 by 1200 on the board at 50 percent, and the note is centred on that
    expect(items()).toHaveLength(1)
    expect(items()[0]).toMatchObject({ x: 1900, y: 1120, colour: 'yellow', author: 'you' })
    expect(screen.getByRole('textbox', { name: 'Note text' })).toHaveFocus()
    await user.keyboard('A first idea')
    expect(items()[0].text).toBe('A first idea')
  })

  it('places a note where the board is pressed once the sticky tool is in hand, in the colour chosen, and goes back to select', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await inHand(user, 'Note')
    await user.click(screen.getByRole('radio', { name: 'Mint' }))
    expect(screen.getByRole('button', { name: 'Note' })).toHaveAttribute('aria-pressed', 'true')
    await user.pointer({ keys: '[MouseLeft>]', target: surface(), coords: { clientX: 500, clientY: 400 } })
    await user.pointer({ keys: '[/MouseLeft]' })
    expect(items()).toHaveLength(1)
    expect(items()[0]).toMatchObject({ colour: 'mint', x: 900, y: 720 })
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Note' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('puts the tool down again when it is pressed a second time, or on Escape', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Note' }))
    await user.click(screen.getByRole('button', { name: 'Note' }))
    expect(latestState.tool).toBe('select')
    await user.click(screen.getByRole('button', { name: 'Note' }))
    viewport().focus()
    await user.keyboard('{Escape}')
    expect(latestState.tool).toBe('select')
  })

  it('adds a note to the middle of the view from the plus, with no pointer, in a place that is clear, ready to write in', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await inHand(user, 'Note')
    await user.click(screen.getByRole('button', { name: 'Add a note to the middle of the view' }))
    await user.keyboard('x{Escape}')
    await inHand(user, 'Note')
    await user.click(screen.getByRole('button', { name: 'Add a note to the middle of the view' }))
    expect(items()).toHaveLength(2)
    const [first, second] = items()
    expect(first.text).toBe('x')
    // the second is not on top of the first
    expect(first.x + first.w <= second.x || second.x + second.w <= first.x || first.y + first.h <= second.y || second.y + second.h <= first.y).toBe(true)
  })

  it('does not place a note when the empty board is pressed with the select tool', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(surface())
    expect(items()).toHaveLength(0)
  })
})

describe('the bar over the selection', () => {
  it('colours the selected notes', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 800, 400)]} />)
    viewport().focus()
    await user.keyboard('{Control>}a{/Control}')
    await user.click(within(screen.getByRole('toolbar', { name: 'Selected' })).getByRole('button', { name: 'Lilac' }))
    expect(items().map((item) => item.colour)).toEqual(['lilac', 'lilac'])
    expect(within(screen.getByRole('toolbar', { name: 'Selected' })).getByRole('button', { name: 'Lilac' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('has no pink to choose, since pink is Droplet\'s', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400)]} />)
    await user.click(noteEl('a'))
    expect(within(screen.getByRole('toolbar', { name: 'Selected' })).queryByRole('button', { name: 'Pink' })).not.toBeInTheDocument()
  })

  it('deletes the selected notes', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 800, 400)]} />)
    await user.click(noteEl('a'))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(items().map((item) => item.id)).toEqual(['b'])
    expect(screen.getByRole('status')).toHaveTextContent('Deleted 1 thing.')
  })

  it('is hidden while a note is being written in', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400)]} />)
    await user.click(noteEl('a'))
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('toolbar', { name: 'Selected' })).not.toBeInTheDocument()
  })

  it('deletes with the Delete key', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 800, 400)]} />)
    await user.click(noteEl('a'))
    await user.keyboard('{Delete}')
    expect(items().map((item) => item.id)).toEqual(['b'])
  })
})

describe('resizing', () => {
  it('has a handle for a single selected note only', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 800, 400)]} />)
    expect(document.querySelector('.resize-handle')).toBeNull()
    await user.click(noteEl('a'))
    expect(document.querySelectorAll('.resize-handle')).toHaveLength(1)
    viewport().focus()
    await user.keyboard('{Control>}a{/Control}')
    expect(document.querySelector('.resize-handle')).toBeNull()
  })

  it('resizes with the handle, snapped, as one step', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400)]} />)
    await user.click(noteEl('a'))
    await user.pointer([{ keys: '[MouseLeft>]', target: document.querySelector('.resize-handle')!, coords: { clientX: 500, clientY: 500 } }, { coords: { clientX: 550, clientY: 530 } }, { keys: '[/MouseLeft]' }])
    expect(items()[0]).toMatchObject({ w: 300, h: 240, x: 400, y: 400 })
  })

  it('keeps a note within its smallest size when it is dragged small', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400)]} />)
    await user.click(noteEl('a'))
    await user.pointer([{ keys: '[MouseLeft>]', target: document.querySelector('.resize-handle')!, coords: { clientX: 500, clientY: 500 } }, { coords: { clientX: 100, clientY: 100 } }, { keys: '[/MouseLeft]' }])
    expect(items()[0]).toMatchObject({ w: 120, h: 100 })
  })

  it('resizes with Alt and the arrow keys, a grid step at a time', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400)]} />)
    await user.click(noteEl('a'))
    await user.keyboard('{Alt>}{ArrowRight}{ArrowDown}{/Alt}')
    expect(items()[0]).toMatchObject({ w: 220, h: 200 })
    expect(screen.getByRole('status')).toHaveTextContent('It is now 220 by 200.')
  })
})

describe('zoom', () => {
  const zoomLabel = () => screen.getByRole('button', { name: /^Zoom \d+%/ })

  it('opens zoomed out, and steps in and out', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(zoomLabel()).toHaveTextContent('50%')
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(zoomLabel()).toHaveTextContent('67%')
    await user.click(screen.getByRole('button', { name: 'Zoom out' }))
    await user.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(zoomLabel()).toHaveTextContent('33%')
  })

  it('goes to 100 percent from the percentage, and fits the whole board from Fit', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(zoomLabel())
    expect(zoomLabel()).toHaveTextContent('100%')
    await user.click(screen.getByRole('button', { name: 'Fit' }))
    // no size in a test, so the board fits at the smallest zoom
    expect(zoomLabel()).toHaveTextContent('25%')
  })

  it('stops at the smallest and the largest', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    for (let i = 0; i < 8; i++) await user.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(zoomLabel()).toHaveTextContent('25%')
    for (let i = 0; i < 12; i++) await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(zoomLabel()).toHaveTextContent('200%')
  })

  it('zooms with Ctrl and the wheel, and leaves a plain wheel to scroll', () => {
    render(<Harness />)
    fireEvent.wheel(viewport(), { deltaY: 120 })
    expect(zoomLabel()).toHaveTextContent('50%')
    fireEvent.wheel(viewport(), { deltaY: -200, ctrlKey: true })
    expect(Number.parseInt(zoomLabel().textContent ?? '0', 10)).toBeGreaterThan(50)
  })

  it('draws the board at the size of the zoom, and the notes at the size of the board', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400)]} />)
    expect(surface().style.width).toBe('2400px')
    expect(surface().style.height).toBe('1600px')
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(surface().style.width).toBe(`${4800 * 0.67}px`)
    // the note keeps its board position: only the world around it is scaled
    expect(position('a')).toEqual({ left: 400, top: 400 })
  })
})


// ---- Shapes, text, frames and arrows ----

describe('shapes', () => {
  it('draws each kind of shape, with its words, and says what it is', () => {
    render(<Harness items={[shape('a', 400, 400, 'rectangle'), shape('b', 800, 400, 'ellipse'), shape('c', 1200, 400, 'diamond')]} />)
    expect(itemEl('a')).toHaveAccessibleName('Rectangle: a')
    expect(itemEl('b').querySelector('[data-shape="ellipse"]')).not.toBeNull()
    expect(itemEl('c').querySelector('polygon')).not.toBeNull()
    expect(itemEl('c')).toHaveAccessibleName('Diamond: c')
  })

  it('places a shape of the kind in hand when the board is pressed with the shape tool, and writes in it at once', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await inHand(user, 'Shape')
    await user.click(screen.getByRole('radio', { name: 'Ellipse' }))
    await user.pointer([{ keys: '[MouseLeft>]', target: surface(), coords: { clientX: 500, clientY: 400 } }, { keys: '[/MouseLeft]' }])
    expect(everything()).toHaveLength(1)
    expect(everything()[0]).toMatchObject({ kind: 'shape', shape: 'ellipse', w: 200, h: 140 })
    expect(latestState.tool).toBe('select')
    await user.keyboard('Our offer')
    expect(everything()[0]).toMatchObject({ text: 'Our offer' })
  })

  it('draws a shape to size when the pointer is dragged', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Shape' }))
    // 200 and 200 to 400 and 360 on the screen is 400 and 400 to 800 and 720 on the board
    await pull(user, surface(), [200, 200], [400, 360])
    expect(everything()[0]).toMatchObject({ kind: 'shape', x: 400, y: 400, w: 400, h: 320 })
  })

  it('treats a drag that goes almost nowhere as a click, and gives the usual size', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Shape' }))
    await pull(user, surface(), [500, 400], [507, 405])
    expect(everything()[0]).toMatchObject({ w: 200, h: 140 })
  })

  it('shows the shape being drawn, and puts nothing on the board until it is let go', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Shape' }))
    await user.pointer([{ keys: '[MouseLeft>]', target: surface(), coords: { clientX: 200, clientY: 200 } }, { coords: { clientX: 400, clientY: 360 } }])
    expect(document.querySelector('.board__marquee--draw')).not.toBeNull()
    expect(everything()).toHaveLength(0)
    await user.pointer({ keys: '[/MouseLeft]' })
    expect(document.querySelector('.board__marquee--draw')).toBeNull()
  })

  it('puts the shape tool down on Escape while drawing, and places nothing', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Shape' }))
    await user.pointer([{ keys: '[MouseLeft>]', target: surface(), coords: { clientX: 200, clientY: 200 } }, { coords: { clientX: 400, clientY: 360 } }])
    await user.keyboard('{Escape}')
    await user.pointer({ keys: '[/MouseLeft]' })
    expect(everything()).toHaveLength(0)
  })

  it('has a plus that adds a shape to the middle of the view, in a clear place', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await inHand(user, 'Shape')
    await user.click(screen.getByRole('button', { name: 'Add a shape to the middle of the view' }))
    await user.keyboard('x')
    expect(everything()[0]).toMatchObject({ kind: 'shape', text: 'x' })
  })

  it('changes the kind and the colour of a selected shape from the bar, with white among the colours', async () => {
    const user = userEvent.setup()
    render(<Harness items={[shape('a', 400, 400)]} />)
    await user.click(itemEl('a'))
    const bar = within(screen.getByRole('toolbar', { name: 'Selected' }))
    expect(bar.getByRole('button', { name: 'White' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(bar.getByRole('button', { name: 'Diamond' }))
    await user.click(bar.getByRole('button', { name: 'Sky' }))
    expect(everything()[0]).toMatchObject({ shape: 'diamond', colour: 'sky' })
  })

  it('writes in a shape when it is double-clicked, and a press inside it is not a drag', async () => {
    const user = userEvent.setup()
    render(<Harness items={[shape('a', 400, 400)]} />)
    await user.dblClick(itemEl('a'))
    expect(screen.getByRole('textbox', { name: 'Shape text' })).toHaveFocus()
    await user.keyboard('!')
    expect(everything()[0]).toMatchObject({ text: 'a!' })
  })

  it('has no pink to choose for a shape', async () => {
    const user = userEvent.setup()
    render(<Harness items={[shape('a', 400, 400)]} />)
    await user.click(itemEl('a'))
    expect(within(screen.getByRole('toolbar', { name: 'Selected' })).queryByRole('button', { name: 'Pink' })).not.toBeInTheDocument()
  })
})

describe('text', () => {
  it('places a text label with the text tool and writes in it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Text' }))
    await user.pointer([{ keys: '[MouseLeft>]', target: surface(), coords: { clientX: 500, clientY: 400 } }, { keys: '[/MouseLeft]' }])
    await user.keyboard('A heading')
    expect(everything()[0]).toMatchObject({ kind: 'text', text: 'A heading', size: 'body' })
  })

  it('changes the size of a selected text label from the bar', async () => {
    const user = userEvent.setup()
    render(<Harness items={[{ id: 't', kind: 'text', x: 400, y: 400, w: 240, h: 60, text: 'Offers', size: 'body' }]} />)
    await user.click(itemEl('t'))
    const bar = within(screen.getByRole('toolbar', { name: 'Selected' }))
    expect(bar.getByRole('button', { name: 'Text' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(bar.getByRole('button', { name: 'Title' }))
    expect(everything()[0]).toMatchObject({ size: 'title' })
    expect(bar.queryByRole('button', { name: 'Yellow' })).not.toBeInTheDocument()
  })
})

describe('frames', () => {
  it('draws a frame to size by dragging, and asks for its title', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Frame' }))
    await pull(user, surface(), [100, 100], [500, 400])
    expect(everything()[0]).toMatchObject({ kind: 'frame', x: 200, y: 200, w: 800, h: 600, title: 'Frame' })
    const field = screen.getByRole('textbox', { name: 'Frame title' })
    expect(field).toHaveFocus()
    await user.keyboard('Offers')
    // the title is selected when it opens, so typing replaces "Frame"
    expect(everything()[0]).toMatchObject({ title: 'Offers' })
  })

  it('renames a frame from its title, and stops on Enter', async () => {
    const user = userEvent.setup()
    render(<Harness items={[frame('f', 200, 200, 800, 600, 'Ideas')]} />)
    await user.dblClick(document.querySelector('.frame__title')!)
    await user.keyboard('{Control>}a{/Control}Names{Enter}')
    expect(everything()[0]).toMatchObject({ title: 'Names' })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('says what a frame is, with its title', () => {
    render(<Harness items={[frame('f', 200, 200, 800, 600, 'Ideas')]} />)
    expect(itemEl('f')).toHaveAccessibleName('Frame: Ideas')
  })

  it('moves what is inside it when it is dragged by its title, and not what is outside', async () => {
    const user = userEvent.setup()
    render(<Harness items={[frame('f', 200, 200), note('in', 400, 400), note('out', 2000, 400)]} />)
    await pull(user, document.querySelector('.frame__title')!, [100, 100], [200, 100])
    expect(position('f')).toEqual({ left: 400, top: 200 })
    expect(position('in')).toEqual({ left: 600, top: 400 })
    expect(position('out')).toEqual({ left: 2000, top: 400 })
  })

  it('shows the contents moving with the frame while it is carried', async () => {
    const user = userEvent.setup()
    render(<Harness items={[frame('f', 200, 200), note('in', 400, 400)]} />)
    await user.pointer([{ keys: '[MouseLeft>]', target: document.querySelector('.frame__title')!, coords: { clientX: 100, clientY: 100 } }, { coords: { clientX: 200, clientY: 100 } }])
    expect(position('in')).toEqual({ left: 600, top: 400 })
    expect(everything().find((item) => item.id === 'in')).toMatchObject({ x: 400 })
    await user.pointer({ keys: '[/MouseLeft]' })
  })

  it('moves with the arrow keys and takes what is inside, saying how many things moved', async () => {
    const user = userEvent.setup()
    render(<Harness items={[frame('f', 200, 200), note('in', 400, 400)]} />)
    itemEl('f').focus()
    await user.keyboard('{ArrowRight}')
    expect(position('f').left).toBe(220)
    expect(position('in').left).toBe(420)
    expect(screen.getByRole('status')).toHaveTextContent('Moved 2 things.')
  })

  it('is deleted without what is inside it with Delete, and the board says what stays', async () => {
    const user = userEvent.setup()
    render(<Harness items={[frame('f', 200, 200), note('in', 400, 400)]} />)
    itemEl('f').focus()
    await user.keyboard('{Delete}')
    expect(everything().map((item) => item.id)).toEqual(['in'])
    expect(screen.getByRole('status')).toHaveTextContent('Deleted the frame. The 1 thing in it stays on the board.')
  })

  it('offers to delete a frame with what is inside it, and asks before it does', async () => {
    const user = userEvent.setup()
    render(<Harness items={[frame('f', 200, 200), note('in', 400, 400), note('also', 600, 400)]} />)
    await user.click(document.querySelector('.frame__title')!)
    const bar = within(screen.getByRole('toolbar', { name: 'Selected' }))
    await user.click(bar.getByRole('button', { name: 'Delete with contents' }))
    expect(screen.getByText('Delete the frame and 2 things in it?')).toBeInTheDocument()
    expect(everything()).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(everything()).toHaveLength(3)
    await user.click(bar.getByRole('button', { name: 'Delete with contents' }))
    await user.click(screen.getByRole('button', { name: 'Delete all' }))
    expect(everything()).toHaveLength(0)
  })

  it('can be given a colour from the bar', async () => {
    const user = userEvent.setup()
    render(<Harness items={[frame('f', 200, 200)]} />)
    await user.click(document.querySelector('.frame__title')!)
    await user.click(within(screen.getByRole('toolbar', { name: 'Selected' })).getByRole('button', { name: 'Mint' }))
    expect(everything()[0]).toMatchObject({ colour: 'mint' })
  })

  it('resizes with its handle, and with Alt and the arrow keys', async () => {
    const user = userEvent.setup()
    render(<Harness items={[frame('f', 200, 200, 400, 300)]} />)
    itemEl('f').focus()
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}')
    expect(everything()[0]).toMatchObject({ w: 420, h: 300 })
    await pull(user, document.querySelector('.resize-handle')!, [300, 200], [400, 250])
    expect(everything()[0]).toMatchObject({ w: 620, h: 400 })
  })

  it('is not selected by a box that only touches it, and is when the box takes in all of it', async () => {
    const user = userEvent.setup()
    render(<Harness items={[frame('f', 200, 200, 400, 300), note('in', 260, 260, { w: 120, h: 100 })]} />)
    // a box over part of the frame: it takes the note and not the frame
    await pull(user, surface(), [110, 110], [250, 200])
    expect(latestState.selection).toEqual(['in'])
    await pull(user, surface(), [50, 50], [700, 500])
    expect(latestState.selection.sort()).toEqual(['f', 'in'])
  })
})

describe('arrows', () => {
  const two = () => <Harness items={[note('a', 400, 400), note('b', 1400, 400)]} />

  it('draws an arrow from one thing to another with the arrow tool, then puts the tool down and selects it', async () => {
    const user = userEvent.setup()
    render(two())
    await user.click(screen.getByRole('button', { name: 'Arrow' }))
    // from inside the first note to inside the second: 250 and 250 is 500 and 500 on the board
    await pull(user, itemEl('a'), [250, 250], [800, 250])
    expect(everything().filter((item) => item.kind === 'connector')).toHaveLength(1)
    expect(arrowEls()[0]).toHaveAccessibleName('Arrow from a to b')
    expect(latestState.tool).toBe('select')
    expect(latestState.selection).toEqual([everything().find((item) => item.kind === 'connector')!.id])
  })

  it('ends at a point of its own when it is let go on nothing', async () => {
    const user = userEvent.setup()
    render(two())
    await user.click(screen.getByRole('button', { name: 'Arrow' }))
    await pull(user, itemEl('a'), [250, 250], [500, 700])
    expect(arrowEls()[0]).toHaveAccessibleName('Arrow from a to a point')
  })

  it('draws nothing when the pointer is only pressed, or moved a very little', async () => {
    const user = userEvent.setup()
    render(two())
    await user.click(screen.getByRole('button', { name: 'Arrow' }))
    await pull(user, itemEl('a'), [250, 250], [254, 252])
    expect(arrowEls()).toHaveLength(0)
  })

  it('does nothing with the arrow tool on the empty board', async () => {
    const user = userEvent.setup()
    render(two())
    await user.click(screen.getByRole('button', { name: 'Arrow' }))
    await pull(user, surface(), [100, 700], [400, 700])
    expect(arrowEls()).toHaveLength(0)
  })

  it('shows the arrow while it is pulled, and lights the thing it would land on', async () => {
    const user = userEvent.setup()
    render(two())
    await user.click(screen.getByRole('button', { name: 'Arrow' }))
    await user.pointer([{ keys: '[MouseLeft>]', target: itemEl('a'), coords: { clientX: 250, clientY: 250 } }, { coords: { clientX: 800, clientY: 250 } }])
    expect(document.querySelector('.connector__line--draft')).not.toBeNull()
    expect(document.querySelector('.connect-target')).not.toBeNull()
    expect(arrowEls()).toHaveLength(0)
    await user.pointer({ keys: '[/MouseLeft]' })
    expect(document.querySelector('.connect-target')).toBeNull()
  })

  it('draws an arrow from the dots on a selected thing, without the tool', async () => {
    const user = userEvent.setup()
    render(two())
    await user.click(itemEl('a'))
    expect(document.querySelectorAll('.dot')).toHaveLength(4)
    await pull(user, document.querySelector('.dot[data-side="right"]')!, [300, 250], [800, 250])
    expect(arrowEls()[0]).toHaveAccessibleName('Arrow from a to b')
  })

  it('draws the arrow in the style in hand', async () => {
    const user = userEvent.setup()
    render(two())
    await inHand(user, 'Arrow')
    await user.click(screen.getByRole('radio', { name: 'Elbow' }))
    await pull(user, itemEl('a'), [250, 250], [800, 250])
    expect(everything().find((item) => item.kind === 'connector')).toMatchObject({ style: 'elbow' })
  })

  it('joins two selected things with an arrow from the bar, from the first selected to the second', async () => {
    const user = userEvent.setup()
    render(two())
    await user.click(itemEl('b'))
    await user.keyboard('{Shift>}')
    await user.click(itemEl('a'))
    await user.keyboard('{/Shift}')
    await user.click(screen.getByRole('button', { name: 'Join the two with an arrow' }))
    expect(arrowEls()[0]).toHaveAccessibleName('Arrow from b to a')
    expect(screen.getByRole('status')).toHaveTextContent('Joined them with an arrow.')
  })

  it('follows a thing when it moves, and goes when it is deleted', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 1400, 400), arrow('c', 'a', 'b')]} />)
    const before = arrowEls()[0].querySelector('.connector__line')!.getAttribute('d')
    await user.click(itemEl('b'))
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}')
    expect(arrowEls()[0].querySelector('.connector__line')!.getAttribute('d')).not.toBe(before)
    await user.keyboard('{Delete}')
    expect(arrowEls()).toHaveLength(0)
  })

  it('follows a thing while it is carried', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 1400, 400), arrow('c', 'a', 'b')]} />)
    const before = arrowEls()[0].querySelector('.connector__line')!.getAttribute('d')
    await user.pointer([{ keys: '[MouseLeft>]', target: itemEl('b'), coords: { clientX: 750, clientY: 250 } }, { coords: { clientX: 750, clientY: 450 } }])
    expect(arrowEls()[0].querySelector('.connector__line')!.getAttribute('d')).not.toBe(before)
    await user.pointer({ keys: '[/MouseLeft]' })
  })

  it('shows handles at both ends of a selected arrow, and moves an end onto another thing', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 1400, 400), note('n', 2600, 400), arrow('c', 'a', 'b')]} />)
    await user.click(arrowEls()[0].querySelector('.connector__hit')!)
    expect(document.querySelectorAll('.connector__handle')).toHaveLength(2)
    // the end handle onto the note at 2600 on the board, which is 1300 and 250 on the screen
    await pull(user, document.querySelector('.connector__handle[data-end="to"]')!, [700, 250], [1350, 250])
    expect(arrowEls()[0]).toHaveAccessibleName('Arrow from a to n')
  })

  it('moves an end to a point of its own when it is let go on nothing', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 1400, 400), arrow('c', 'a', 'b')]} />)
    await user.click(arrowEls()[0].querySelector('.connector__hit')!)
    await pull(user, document.querySelector('.connector__handle[data-end="to"]')!, [700, 250], [900, 900])
    expect(arrowEls()[0]).toHaveAccessibleName('Arrow from a to a point')
  })

  it('is one step to move an end, and undo puts it back', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 1400, 400), arrow('c', 'a', 'b')]} />)
    await user.click(arrowEls()[0].querySelector('.connector__hit')!)
    await pull(user, document.querySelector('.connector__handle[data-end="to"]')!, [700, 250], [900, 900])
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(arrowEls()[0]).toHaveAccessibleName('Arrow from a to b')
  })

  it('has a bar for the arrow with its line and its arrowheads', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 1400, 400), arrow('c', 'a', 'b')]} />)
    await user.click(arrowEls()[0].querySelector('.connector__hit')!)
    const bar = within(screen.getByRole('toolbar', { name: 'Selected' }))
    await user.click(bar.getByRole('button', { name: 'Elbow' }))
    await user.click(bar.getByRole('button', { name: 'Arrows at both ends' }))
    expect(everything().find((item) => item.kind === 'connector')).toMatchObject({ style: 'elbow', head: 'both' })
    expect(bar.queryByRole('button', { name: 'Yellow' })).not.toBeInTheDocument()
    expect(bar.queryByRole('button', { name: 'Join the two with an arrow' })).not.toBeInTheDocument()
  })

  it('draws no arrowhead when it has none, and one at each end when it has both', async () => {
    const { rerender } = render(<Harness items={[note('a', 400, 400), note('b', 1400, 400), { ...(arrow('c', 'a', 'b') as object), head: 'both' } as BoardItem]} />)
    const line = () => arrowEls()[0].querySelector('.connector__line')!
    expect(line().getAttribute('marker-start')).toBeTruthy()
    expect(line().getAttribute('marker-end')).toBeTruthy()
    rerender(<Harness key="none" items={[note('a', 400, 400), note('b', 1400, 400), { ...(arrow('c', 'a', 'b') as object), head: 'none' } as BoardItem]} />)
    expect(line().getAttribute('marker-start')).toBeNull()
    expect(line().getAttribute('marker-end')).toBeNull()
  })

  it('has a label, written by double-clicking the arrow', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 1400, 400), arrow('c', 'a', 'b')]} />)
    await user.dblClick(arrowEls()[0].querySelector('.connector__hit')!)
    await user.keyboard('leads to{Enter}')
    expect(document.querySelector('.connector__label')).toHaveTextContent('leads to')
    expect(arrowEls()[0]).toHaveAccessibleName('Arrow from a to b, labelled leads to')
  })

  it('writes the label on Enter for a selected arrow', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 1400, 400), arrow('c', 'a', 'b')]} />)
    arrowEls()[0].focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('textbox', { name: 'Arrow label' })).toHaveFocus()
  })

  it('is selected by a box that takes in both its ends, and not by one that takes in one', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 1400, 400), arrow('c', 'a', 'b')]} />)
    await pull(user, surface(), [100, 100], [450, 400])
    expect(latestState.selection).toEqual(['a'])
    await pull(user, surface(), [100, 100], [1000, 500])
    expect(latestState.selection.sort()).toEqual(['a', 'b', 'c'])
  })

  it('cannot be dragged as a thing: pressing it selects it and moves nothing', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400), note('b', 1400, 400), arrow('c', 'a', 'b')]} />)
    await pull(user, arrowEls()[0].querySelector('.connector__hit')!, [500, 250], [700, 600])
    expect(everything().find((item) => item.kind === 'connector')).toMatchObject({ from: { item: 'a' }, to: { item: 'b' } })
    expect(latestState.selection).toEqual(['c'])
  })
})

describe('order', () => {
  const order = () => everything().map((item) => item.id)

  it('brings forward and sends backward with Ctrl or Cmd and the bracket keys, and to the front and back with Shift', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 100, 100), note('b', 600, 100), note('c', 1100, 100)]} />)
    await user.click(itemEl('a'))
    await user.keyboard('{Control>}]{/Control}')
    expect(order()).toEqual(['b', 'a', 'c'])
    await user.keyboard('{Control>}{Shift>}]{/Shift}{/Control}')
    expect(order()).toEqual(['b', 'c', 'a'])
    await user.keyboard('{Control>}{Shift>}[[{/Shift}{/Control}')
    expect(order()).toEqual(['a', 'b', 'c'])
  })

  it('has buttons on the bar for forward and backward', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 100, 100), note('b', 600, 100)]} />)
    await user.click(itemEl('a'))
    await user.click(screen.getByRole('button', { name: 'Bring forward' }))
    expect(order()).toEqual(['b', 'a'])
    await user.click(screen.getByRole('button', { name: 'Send backward' }))
    expect(order()).toEqual(['a', 'b'])
  })

  it('draws frames behind arrows, and arrows behind the rest, whatever order they were made in', () => {
    render(<Harness items={[note('a', 400, 400), note('b', 1400, 400), arrow('c', 'a', 'b'), frame('f', 200, 200)]} />)
    const nodes = [...document.querySelectorAll('.board__world > *')]
    const index = (selector: string) => nodes.findIndex((node) => node.matches(selector) || node.querySelector(selector))
    expect(index('.frame')).toBeLessThan(index('.connectors'))
    expect(index('.connectors')).toBeLessThan(index('.note'))
  })
})


// ---- Templates ----

describe('templates', () => {
  const useTemplate = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(screen.getByRole('button', { name: 'Templates' }))
    await user.click(within(screen.getByRole('menu', { name: 'Templates' })).getByRole('menuitem', { name: new RegExp(`^${name}`) }))
  }
  const guides = () => [...document.querySelectorAll<HTMLElement>('[data-guide]')]

  it('has a menu of every template, each with what it is for, which opens and closes', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Templates' }))
    const menu = within(screen.getByRole('menu', { name: 'Templates' }))
    expect(menu.getAllByRole('menuitem')).toHaveLength(TEMPLATES.length)
    for (const template of TEMPLATES) expect(menu.getByRole('menuitem', { name: new RegExp(template.name) })).toHaveTextContent(template.summary)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Templates' })).not.toBeInTheDocument())
  })

  it('puts the template on the board and closes the menu, saying what it did, with the tool down', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await useTemplate(user, 'Customer and problem')
    const template = templateById('customer_problem')!
    expect(everything()).toHaveLength(template.items.length)
    expect(everything().filter((item) => item.kind === 'frame')).toHaveLength(3)
    expect(everything().filter((item) => item.kind === 'connector')).toHaveLength(2)
    expect(screen.getByRole('status')).toHaveTextContent('Added the Customer and problem template.')
    expect(latestState.tool).toBe('select')
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Templates' })).not.toBeInTheDocument())
  })

  it('is one step, and undo takes all of it off', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await useTemplate(user, 'Name ideas')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(everything()).toHaveLength(0)
  })

  it('shows its prompts as faint hints in notes with nothing written in them', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await useTemplate(user, 'Customer and problem')
    expect(guides().length).toBeGreaterThan(0)
    expect(screen.getAllByText('Describe one real person')).toHaveLength(1)
    const prompt = screen.getByText('Who is it for?', { selector: '.frame__title' })
    expect(prompt).toBeInTheDocument()
    expect(guides()[0]).toHaveAccessibleName(/^Empty note, /)
  })

  it('writes in a prompt: the hint goes, and it is a note like any other', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await useTemplate(user, 'Customer and problem')
    const prompt = guides()[0]
    const hint = prompt.textContent!
    expect(hint).toContain('Describe one real person')
    await user.dblClick(prompt)
    // while it is written in, the hint stays as the field's own placeholder
    expect(screen.getByRole('textbox', { name: 'Note text' })).toHaveAttribute('placeholder', hint)
    await user.keyboard('Megan, 25')
    await user.keyboard('{Escape}')
    expect(prompt).not.toHaveAttribute('data-guide')
    expect(prompt).toHaveTextContent('Megan, 25')
    expect(prompt).not.toHaveTextContent('Describe one real person')
  })

  it('shows the hint again if what was written is taken out', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await useTemplate(user, 'Customer and problem')
    const prompt = guides()[0]
    await user.dblClick(prompt)
    await user.keyboard('x{Backspace}{Escape}')
    expect(prompt).toHaveAttribute('data-guide')
  })

  it('goes to the nearest clear place, not on top of what is already there', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('mine', 100, 100)]} />)
    await useTemplate(user, 'Brain dump')
    const mine = rectOf(everything().find((item) => item.id === 'mine') as NoteItem)
    for (const item of everything().filter(isRectItem).filter((other) => other.id !== 'mine')) expect(intersects(rectOf(item), mine)).toBe(false)
  })

  it('puts a second template clear of the first, and the two are different uses', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await useTemplate(user, 'Brain dump')
    await useTemplate(user, 'Brain dump')
    const frames = everything().filter(isFrame)
    expect(frames).toHaveLength(2)
    expect(intersects(rectOf(frames[0]), rectOf(frames[1]))).toBe(false)
    expect(frames[0].group).not.toBe(frames[1].group)
  })

  it('says so when there was no clear space, and still adds it', async () => {
    const user = userEvent.setup()
    render(<Harness items={[frame('wall', 0, 0, 4800, 3200, 'Everything')]} />)
    await useTemplate(user, 'Brain dump')
    expect(screen.getByRole('status')).toHaveTextContent('over what was there, since there was no clear space')
    expect(everything().filter(isFrame)).toHaveLength(2)
  })

  it('lets a frame of the template carry its prompts, as any frame does', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await useTemplate(user, 'Brain dump')
    const before = everything().filter((item) => item.kind === 'note').map((item) => (item as NoteItem).x)
    await user.click(document.querySelector('.frame__title')!)
    await user.keyboard('{ArrowRight}')
    expect(everything().filter((item) => item.kind === 'note').map((item) => (item as NoteItem).x)).toEqual(before.map((x) => x + 20))
  })

  it('has no menu of templates on screen until it is asked for', () => {
    render(<Harness />)
    expect(screen.queryByRole('menu', { name: 'Templates' })).not.toBeInTheDocument()
  })
})

describe('resetting a template', () => {
  const useTemplate = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(screen.getByRole('button', { name: 'Templates' }))
    await user.click(within(screen.getByRole('menu', { name: 'Templates' })).getByRole('menuitem', { name: new RegExp(`^${name}`) }))
  }
  // A prompt of the template that has nothing written in it (the founder's own notes are not prompts).
  const firstPrompt = () => document.querySelector<HTMLElement>('.note[data-guide]')!

  it('is offered for a thing from a template, and not for a thing of the founder\'s own', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('mine', 3800, 2800)]} />)
    await user.click(itemEl('mine'))
    expect(screen.queryByRole('button', { name: 'Reset template' })).not.toBeInTheDocument()
    await useTemplate(user, 'Name ideas')
    await user.click(document.querySelector('.frame__title')!)
    expect(screen.getByRole('button', { name: 'Reset template' })).toBeInTheDocument()
  })

  it('is not offered for a selection that mixes a template with something else', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('mine', 3800, 2800)]} />)
    await useTemplate(user, 'Name ideas')
    await user.click(document.querySelector('.frame__title')!)
    await user.keyboard('{Shift>}')
    await user.click(itemEl('mine'))
    await user.keyboard('{/Shift}')
    expect(screen.queryByRole('button', { name: 'Reset template' })).not.toBeInTheDocument()
  })

  it('asks first, since what was written is lost, and keeps everything on Keep', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await useTemplate(user, 'Name ideas')
    const prompt = firstPrompt()
    await user.dblClick(prompt)
    await user.keyboard('Kindred{Escape}')
    await user.click(document.querySelector('.frame__title')!)
    await user.click(screen.getByRole('button', { name: 'Reset template' }))
    expect(screen.getByText('Reset the Name ideas template? What you wrote in it goes.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(prompt).toHaveTextContent('Kindred')
  })

  it('puts the template back as it was: fresh prompts, where its top-left corner is now, as one step', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('mine', 3800, 2800, { text: 'my own' })]} />)
    await useTemplate(user, 'Name ideas')
    const template = templateById('name_ideas')!
    const ideas = () => everything().filter(isFrame).find((item) => item.title === 'Name ideas')!
    await user.dblClick(firstPrompt())
    await user.keyboard('Kindred{Escape}')
    // move the first frame (and the prompts in it), and delete a prompt, so that it is not as it was
    await user.click(document.querySelector('.frame__title')!)
    await user.keyboard('{ArrowRight}')
    const movedTo = ideas().x
    await user.click(firstPrompt())
    await user.keyboard('{Delete}')
    expect(everything()).toHaveLength(template.items.length)
    await user.click(document.querySelector('.frame__title')!)
    await user.click(screen.getByRole('button', { name: 'Reset template' }))
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(everything()).toHaveLength(template.items.length + 1)
    expect(document.querySelectorAll('[data-guide]').length).toBeGreaterThan(0)
    expect(screen.queryByText('Kindred')).not.toBeInTheDocument()
    expect(itemEl('mine')).toHaveTextContent('my own')
    expect(ideas().x).toBe(movedTo)
    expect(screen.getByRole('status')).toHaveTextContent('Reset the Name ideas template.')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText('Kindred')).toBeInTheDocument()
  })

  it('resets only the one use of a template, and leaves another use of it alone', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await useTemplate(user, 'Brain dump')
    await useTemplate(user, 'Brain dump')
    const prompts = [...document.querySelectorAll<HTMLElement>('.note')]
    const groups = [...new Set(everything().map((item) => item.group))]
    expect(groups).toHaveLength(2)
    await user.dblClick(prompts[0])
    await user.keyboard('first{Escape}')
    await user.dblClick(prompts[prompts.length - 1])
    await user.keyboard('second{Escape}')
    await user.click(document.querySelectorAll<HTMLElement>('.frame__title')[0])
    await user.click(screen.getByRole('button', { name: 'Reset template' }))
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.queryByText('first')).not.toBeInTheDocument()
    expect(screen.getByText('second')).toBeInTheDocument()
  })
})


describe('notes by Droplet', () => {
  const droplet = (id: string, x: number): NoteItem => note(id, x, 400, { author: 'ai', colour: 'pink', text: `idea ${id}` })

  it('are pink and say whose they are, and can be kept as the founder\'s own from the bar', async () => {
    const user = userEvent.setup()
    render(<Harness items={[droplet('a', 400)]} />)
    expect(itemEl('a')).toHaveAttribute('data-colour', 'pink')
    await user.click(itemEl('a'))
    await user.click(screen.getByRole('button', { name: 'Keep as mine' }))
    expect(items()[0]).toMatchObject({ author: 'you', colour: 'yellow' })
    expect(screen.getByRole('status')).toHaveTextContent('Kept the note as yours.')
    expect(screen.queryByRole('button', { name: 'Keep as mine' })).not.toBeInTheDocument()
  })

  it('are kept together when several are selected, and only Droplet\'s are changed', async () => {
    const user = userEvent.setup()
    render(<Harness items={[droplet('a', 400), droplet('b', 1000), note('mine', 1600, 400)]} />)
    viewport().focus()
    await user.keyboard('{Control>}a{/Control}')
    await user.click(screen.getByRole('button', { name: 'Keep 2 as mine' }))
    expect(items().map((item) => item.author)).toEqual(['you', 'you', 'you'])
    expect(items().find((item) => item.id === 'mine')?.colour).toBe('yellow')
  })

  it('have no keep button when what is selected is the founder\'s', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('mine', 400, 400)]} />)
    await user.click(itemEl('mine'))
    expect(screen.queryByRole('button', { name: /Keep/ })).not.toBeInTheDocument()
  })

  it('can be taken back with undo after they are kept', async () => {
    const user = userEvent.setup()
    render(<Harness items={[droplet('a', 400)]} />)
    await user.click(itemEl('a'))
    await user.click(screen.getByRole('button', { name: 'Keep as mine' }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(items()[0]).toMatchObject({ author: 'ai', colour: 'pink' })
  })
})

describe('deciding a name or an offer from a thing on the board', () => {
  const memory = emptyMemory()

  it('offers it for one note, shape or text with words on it, and not for anything else', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400, { text: 'Kindred Gifting' }), note('blank', 800, 400, { text: '  ' }), frame('f', 1200, 400)]} decide={{ memory, remember: () => {}, forget: () => {} }} />)
    await user.click(itemEl('a'))
    expect(screen.getByRole('button', { name: 'Use as business name' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Use as offer' })).toBeEnabled()
    await user.click(itemEl('blank'))
    expect(screen.queryByRole('button', { name: 'Use as business name' })).not.toBeInTheDocument()
    viewport().focus()
    await user.keyboard('{Control>}a{/Control}')
    expect(screen.queryByRole('button', { name: 'Use as offer' })).not.toBeInTheDocument()
  })

  it('is not offered where there is no way to remember', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400, { text: 'Kindred Gifting' })]} />)
    await user.click(itemEl('a'))
    expect(screen.queryByRole('button', { name: 'Use as business name' })).not.toBeInTheDocument()
  })

  it('remembers nothing until it is confirmed, and Cancel remembers nothing', async () => {
    const user = userEvent.setup()
    const remember = vi.fn()
    render(<Harness items={[note('a', 400, 400, { text: 'Kindred   Gifting' })]} decide={{ memory, remember, forget: () => {} }} />)
    await user.click(itemEl('a'))
    await user.click(screen.getByRole('button', { name: 'Use as business name' }))
    expect(remember).not.toHaveBeenCalled()
    expect(screen.getByRole('group', { name: 'Remember this as the business name?' })).toHaveTextContent('Remember “Kindred Gifting” as the business name?')
    expect(screen.getByRole('group', { name: 'Remember this as the business name?' })).toHaveTextContent('also the business name on invoices')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(remember).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Use as offer' }))
    await user.click(screen.getByRole('button', { name: 'Remember' }))
    expect(remember).toHaveBeenCalledExactlyOnceWith('offer', 'Kindred Gifting')
    expect(screen.getByRole('status')).toHaveTextContent('Remembered the offer.')
  })

  it('says what it would replace, and offers to forget, not to remember, what is already remembered', async () => {
    const user = userEvent.setup()
    const remembered = withIdea(memory, 'name', 'Old Name', '2026-10-05T09:00:00')
    const { unmount } = render(<Harness items={[note('a', 400, 400, { text: 'New Name' })]} decide={{ memory: remembered, remember: () => {}, forget: () => {} }} />)
    await user.click(itemEl('a'))
    await user.click(screen.getByRole('button', { name: 'Use as business name' }))
    expect(screen.getByRole('group', { name: 'Remember this as the business name?' })).toHaveTextContent('This replaces “Old Name”.')
    unmount()
    render(<Harness items={[note('a', 400, 400, { text: 'Old Name' })]} decide={{ memory: remembered, remember: () => {}, forget: () => {} }} />)
    await user.click(itemEl('a'))
    await user.click(screen.getByRole('button', { name: 'Use as business name' }))
    expect(screen.getByRole('group', { name: 'Remember this as the business name?' })).toHaveTextContent('already remembered')
    // there is nothing to remember again, so the way on is to forget it
    expect(screen.queryByRole('button', { name: 'Remember' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Forget it' })).toBeInTheDocument()
  })

  it('does not offer a name that is too long to be one, but still offers an offer', async () => {
    const user = userEvent.setup()
    render(<Harness items={[note('a', 400, 400, { text: 'x'.repeat(120) })]} decide={{ memory, remember: () => {}, forget: () => {} }} />)
    await user.click(itemEl('a'))
    expect(screen.getByRole('button', { name: 'Use as business name' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Use as offer' })).toBeEnabled()
  })
})

describe('the options of a tool', () => {
  it('are there only while the tool is in hand, so the bar stays one short row', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    for (const name of ['Colour of the next note', 'Kind of the next shape', 'Line of the next arrow']) expect(screen.queryByRole('radiogroup', { name })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /to the middle of the view/ })).not.toBeInTheDocument()
    await inHand(user, 'Note')
    expect(screen.getByRole('radiogroup', { name: 'Colour of the next note' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a note to the middle of the view' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Kind of the next shape' })).not.toBeInTheDocument()
    await inHand(user, 'Shape')
    expect(screen.getByRole('radiogroup', { name: 'Kind of the next shape' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'Colour of the next note' })).not.toBeInTheDocument())
  })

  it('go when the tool is put down by pressing it again, and the choice is kept for next time', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await inHand(user, 'Note')
    await user.click(screen.getByRole('radio', { name: 'Lilac' }))
    await user.click(screen.getByRole('button', { name: 'Note' }))
    await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'Colour of the next note' })).not.toBeInTheDocument())
    await inHand(user, 'Note')
    expect(screen.getByRole('radio', { name: 'Lilac' })).toBeChecked()
  })

  it('are given to Text and Frame too: a plus, and nothing else', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await inHand(user, 'Text')
    expect(screen.getByRole('button', { name: 'Add text to the middle of the view' })).toBeInTheDocument()
    await inHand(user, 'Frame')
    expect(screen.getByRole('button', { name: 'Add a frame to the middle of the view' })).toBeInTheDocument()
  })
})
