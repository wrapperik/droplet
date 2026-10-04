import { useCallback, useEffect, useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { docOf, openBoard, reduceBoard, type BoardAction } from '../../lib/boardState.ts'
import type { BoardSummary } from '../../lib/boardTypes.ts'
import type { ProjectMemory } from '../../lib/memorySave.ts'
import { emptyMemory, withIdea } from '../../lib/projectMemory.ts'
import SummaryWindow from './SummaryWindow.tsx'

const droplet: BoardSummary = { decided: ['The name is Kindred'], open: ['The first offer'], next: ['Call a maker'], by: 'droplet', edited: false, writtenAt: '2026-10-05T10:00:00' }

// The window wired to the real reducer, as the workspace does.
let latest: ReturnType<typeof openBoard>
function Harness({ summary = null, memory = emptyMemory(), onAsk = () => {}, onForget = () => {} }: { summary?: BoardSummary | null; memory?: ProjectMemory; onAsk?: () => void; onForget?: (kind: 'name' | 'offer') => void }) {
  const [state, setState] = useState(() => reduceBoard(openBoard(), { type: 'set_summary', summary }))
  useEffect(() => {
    latest = state
  })
  const dispatch = useCallback((action: BoardAction) => setState((current) => reduceBoard(current, action)), [])
  return (
    <>
      <button type="button" onClick={() => dispatch({ type: 'undo' })}>
        Undo
      </button>
      <SummaryWindow summary={docOf(state).summary} memory={memory} onEdit={(section, lines) => dispatch({ type: 'edit_summary', section, lines, at: '2026-10-05T11:00:00' })} onAsk={onAsk} onForget={onForget} reason="Why." />
    </>
  )
}

describe('the summary window', () => {
  it('has a window of its own with a reason, and a box for each section', () => {
    render(<Harness />)
    expect(screen.getByRole('region', { name: 'Summary' })).toBeInTheDocument()
    for (const name of ['Decided', 'Still open', 'Next']) expect(screen.getByRole('textbox', { name })).toHaveValue('')
  })

  it('says there is no summary yet and offers two ways on: ask Droplet, or write it', async () => {
    const user = userEvent.setup()
    const onAsk = vi.fn()
    render(<Harness onAsk={onAsk} />)
    expect(screen.getByText(/No summary yet/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ask Droplet to write one' }))
    expect(onAsk).toHaveBeenCalledTimes(1)
    // nothing is written by asking: the summary stays empty until Droplet answers
    expect(docOf(latest).summary).toBeNull()
  })

  it('shows what Droplet wrote, a point to a line, and says so', () => {
    render(<Harness summary={droplet} />)
    expect(screen.getByRole('textbox', { name: 'Decided' })).toHaveValue('The name is Kindred')
    expect(screen.getByRole('textbox', { name: 'Still open' })).toHaveValue('The first offer')
    expect(screen.getByText(/Written by Droplet\./)).toBeInTheDocument()
    expect(screen.queryByText(/No summary yet/)).not.toBeInTheDocument()
  })

  it('writing in a box makes the founder\'s own summary when there was none', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByRole('textbox', { name: 'Next' }), 'Ring the printer')
    expect(docOf(latest).summary).toMatchObject({ by: 'you', edited: false, next: ['Ring the printer'], decided: [], open: [] })
    expect(screen.getByText('Written by you.')).toBeInTheDocument()
  })

  it('lets a new line be begun, and tidies it into points as it goes', async () => {
    const user = userEvent.setup()
    render(<Harness summary={droplet} />)
    const box = screen.getByRole('textbox', { name: 'Decided' })
    await user.click(box)
    await user.keyboard('{Control>}{End}{/Control}{Enter}')
    // the empty line is allowed while it is written, and is not a point
    expect(box).toHaveValue('The name is Kindred\n')
    expect(docOf(latest).summary?.decided).toEqual(['The name is Kindred'])
    await user.keyboard('Pretoria only')
    expect(docOf(latest).summary?.decided).toEqual(['The name is Kindred', 'Pretoria only'])
  })

  it('says it was changed by the founder once they change what Droplet wrote', async () => {
    const user = userEvent.setup()
    render(<Harness summary={droplet} />)
    await user.type(screen.getByRole('textbox', { name: 'Next' }), '!')
    expect(docOf(latest).summary?.edited).toBe(true)
    expect(screen.getByText(/Written by Droplet, changed by you\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /replaces your changes/ })).toBeInTheDocument()
  })

  it('is one undo step for what is typed in a box, and the box follows the undo', async () => {
    const user = userEvent.setup()
    render(<Harness summary={droplet} />)
    await user.type(screen.getByRole('textbox', { name: 'Next' }), ' tomorrow')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(docOf(latest).summary?.next).toEqual(['Call a maker'])
    expect(screen.getByRole('textbox', { name: 'Next' })).toHaveValue('Call a maker')
  })

  it('asks Droplet for a new summary from the same place', async () => {
    const user = userEvent.setup()
    const onAsk = vi.fn()
    render(<Harness summary={droplet} onAsk={onAsk} />)
    await user.click(screen.getByRole('button', { name: 'Ask Droplet to write a new one' }))
    expect(onAsk).toHaveBeenCalledTimes(1)
  })
})

describe('what is remembered, in the summary window', () => {
  it('says how to decide a name or an offer when nothing is remembered', () => {
    render(<Harness />)
    expect(screen.getByText(/Use as business name/)).toBeInTheDocument()
    expect(screen.getByText(/Use as offer/)).toBeInTheDocument()
  })

  it('shows the name and the offer that are remembered, and forgets each only after a second press', async () => {
    const user = userEvent.setup()
    const onForget = vi.fn()
    const memory = withIdea(withIdea(emptyMemory(), 'name', 'Kindred Gifting', '2026-10-05T09:00:00'), 'offer', 'Gift boxes from local makers', '2026-10-05T09:01:00')
    render(<Harness memory={memory} onForget={onForget} />)
    expect(screen.getByText('Kindred Gifting')).toBeInTheDocument()
    expect(screen.getByText('Gift boxes from local makers')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Forget the business name' }))
    expect(onForget).not.toHaveBeenCalled()
    const ask = screen.getByText('Forget it?').parentElement!
    await user.click(within(ask).getByRole('button', { name: 'Keep' }))
    expect(onForget).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Forget the offer' }))
    await user.click(screen.getByRole('button', { name: 'Forget' }))
    expect(onForget).toHaveBeenCalledExactlyOnceWith('offer')
  })
})
