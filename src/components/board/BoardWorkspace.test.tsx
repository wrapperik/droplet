import { useCallback, useEffect, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { docOf, openBoard, reduceBoard, type BoardAction } from '../../lib/boardState.ts'
import type { NoteItem } from '../../lib/boardTypes.ts'
import { loadMemory } from '../../lib/memoryStore.ts'
import BoardWorkspace from './BoardWorkspace.tsx'

const note = (id: string, text: string): NoteItem => ({ id, kind: 'note', x: 400, y: 400, w: 200, h: 180, text, colour: 'yellow', author: 'you' })

let latest: ReturnType<typeof openBoard>
function Harness({ onAsk = () => {} }: { onAsk?: (text: string) => void }) {
  const [state, setState] = useState(() => openBoard([note('a', 'Kindred Gifting')]))
  useEffect(() => {
    latest = state
  })
  const dispatch = useCallback((action: BoardAction) => setState((current) => reduceBoard(current, action)), [])
  return (
    <MemoryRouter>
      <BoardWorkspace projectId="p1" projectName="Kindred" state={state} dispatch={dispatch} onAsk={onAsk} />
    </MemoryRouter>
  )
}

beforeEach(() => localStorage.clear())

describe('the board workspace: deciding a name and the summary', () => {
  it('keeps the summary window away until there is a summary, and shows it from the Windows menu', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.queryByRole('region', { name: 'Summary' })).not.toBeInTheDocument()
    expect(docOf(latest).hidden).toContain('summary')
    await user.click(screen.getByRole('button', { name: /Windows/ }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Summary/ }))
    expect(screen.getByRole('region', { name: 'Summary' })).toBeInTheDocument()
  })

  it('remembers a name only after the confirm, and puts it in the project memory', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(document.querySelector<HTMLElement>('[data-item-id="a"]')!)
    await user.click(screen.getByRole('button', { name: 'Use as business name' }))
    expect(loadMemory('p1').idea).toBeUndefined()
    await user.click(screen.getByRole('button', { name: 'Remember' }))
    expect(loadMemory('p1').idea?.name).toBe('Kindred Gifting')
    expect(loadMemory('p1').business?.details.name).toBe('Kindred Gifting')
  })

  it('remembers nothing when the founder cancels', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(document.querySelector<HTMLElement>('[data-item-id="a"]')!)
    await user.click(screen.getByRole('button', { name: 'Use as offer' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(loadMemory('p1').idea).toBeUndefined()
  })

  it('asks Droplet in the conversation from the summary window, and writes nothing itself', async () => {
    const user = userEvent.setup()
    const asked: string[] = []
    render(<Harness onAsk={(text) => asked.push(text)} />)
    await user.click(screen.getByRole('button', { name: /Windows/ }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Summary/ }))
    await user.click(screen.getByRole('button', { name: 'Ask Droplet to write one' }))
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatch(/summary of the board/)
    expect(docOf(latest).summary).toBeNull()
  })

  it('has an Export button in the header', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Export the board' })).toBeInTheDocument()
  })
})
