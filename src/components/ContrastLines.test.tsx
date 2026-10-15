import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { resolveRoles, type PaletteBlock } from '../lib/palette.ts'
import ContrastLines from './ContrastLines.tsx'
import RoleList from './RoleList.tsx'

const good: PaletteBlock[] = [
  { id: 1, hex: '#1F8FE0', role: 'primary' },
  { id: 2, hex: '#0B4F8A', role: 'accent' },
  { id: 3, hex: '#F4F8FB', role: 'background' },
  { id: 4, hex: '#0E1A2B', role: 'text' },
]
const bad = good.map((block) => (block.role === 'text' ? { ...block, hex: '#CFE9FB' } : block))

describe('the contrast lines', () => {
  it('has a line for each key pair with the ratio, a word and an icon for passing, never colour alone', () => {
    render(<ContrastLines roles={resolveRoles(good)} />)
    const rows = within(screen.getByRole('region', { name: 'Contrast of the key pairs' })).getAllByRole('listitem')
    expect(rows.map((row) => row.querySelector('.clines__label')?.textContent)).toEqual(['Text on background', 'Primary on background', 'Accent on background'])
    for (const row of rows) {
      expect(row.textContent).toMatch(/\d+\.\d:1/)
      expect(row.textContent).toMatch(/Passes (AA|AAA)|Fails AA/)
      expect(row.querySelector('.badge__dot svg')).not.toBeNull()
    }
    expect(rows[0]).toHaveTextContent('Passes AAA')
  })

  it('names the failing pair in words', () => {
    render(<ContrastLines roles={resolveRoles(bad)} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Text on background')
    expect(rows[0]).toHaveTextContent('Fails AA')
    expect(rows[0]).toHaveTextContent('#CFE9FB on #F4F8FB')
  })

  it('is a part of the brand that can be gone to, with a reason for being there', () => {
    render(<ContrastLines roles={resolveRoles(good)} />)
    expect(screen.getByRole('region', { name: 'Contrast of the key pairs' })).toHaveAttribute('data-part', 'contrast')
    expect(screen.getByRole('button', { name: 'Why is this here?' })).toBeInTheDocument()
  })

  it('offers Make it more readable only where it is asked for and the text fails, and says what it did', async () => {
    const makeReadable = vi.fn(() => 'Moved the text colour.')
    const { rerender } = render(<ContrastLines roles={resolveRoles(good)} onMakeReadable={makeReadable} bare />)
    expect(screen.queryByRole('button', { name: 'Make it more readable' })).not.toBeInTheDocument()
    rerender(<ContrastLines roles={resolveRoles(bad)} onMakeReadable={makeReadable} bare />)
    await userEvent.click(screen.getByRole('button', { name: 'Make it more readable' }))
    expect(makeReadable).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('Moved the text colour.')
    expect(screen.getByText(/AA is a ratio of 4.5 to 1/)).toBeInTheDocument()
  })

  it('says so when no colour can be found', async () => {
    render(<ContrastLines roles={resolveRoles(bad)} onMakeReadable={() => null} bare />)
    await userEvent.click(screen.getByRole('button', { name: 'Make it more readable' }))
    expect(screen.getByRole('status')).toHaveTextContent('I could not find a colour that reads here')
  })

  it('has no heading or region of its own when it is bare', () => {
    render(<ContrastLines roles={resolveRoles(good)} bare />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })
})

describe('the role list', () => {
  it('has a line for every colour with a choice of role, and who holds each role under it', () => {
    const blocks: PaletteBlock[] = [{ id: 1, hex: '#1F8FE0', role: 'primary' }, { id: 2, hex: '#0B4F8A' }, { id: 3, hex: '#F4F8FB' }, { id: 4, hex: '#0E1A2B' }]
    render(<RoleList blocks={blocks} roles={resolveRoles(blocks)} onChange={() => {}} />)
    expect(screen.getAllByRole('combobox')).toHaveLength(4)
    expect(screen.getByRole('combobox', { name: 'Role of colour 1, #1F8FE0' })).toHaveValue('primary')
    expect(screen.getByRole('combobox', { name: 'Role of colour 2, #0B4F8A' })).toHaveValue('')
    expect(screen.getByRole('heading', { name: 'The roles now' })).toBeInTheDocument()
  })

  it('says which roles were chosen and which are suggested', () => {
    const blocks: PaletteBlock[] = [{ id: 1, hex: '#1F8FE0', role: 'primary' }, { id: 2, hex: '#0B4F8A' }, { id: 3, hex: '#F4F8FB' }, { id: 4, hex: '#0E1A2B' }]
    render(<RoleList blocks={blocks} roles={resolveRoles(blocks)} onChange={() => {}} />)
    const held = document.querySelector('.roles__held')!
    expect(held.textContent).toMatch(/Primary.*#1F8FE0.*chosen by you/)
    expect(held.textContent).toMatch(/Background.*suggested from the colours/)
  })

  it('gives a colour a role, or clears it', async () => {
    const onChange = vi.fn()
    const blocks: PaletteBlock[] = [{ id: 1, hex: '#1F8FE0', role: 'primary' }, { id: 2, hex: '#0B4F8A' }]
    render(<RoleList blocks={blocks} roles={resolveRoles(blocks)} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Role of colour 2, #0B4F8A' }), 'accent')
    expect(onChange).toHaveBeenCalledWith(2, 'accent')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Role of colour 1, #1F8FE0' }), '')
    expect(onChange).toHaveBeenLastCalledWith(1, null)
  })
})
