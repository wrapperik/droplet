import { describe, expect, it } from 'vitest'
import { shownWorkspace } from './shownWorkspace.ts'

const none = { brand: false, invoice: false, board: false }

describe('shownWorkspace', () => {
  it('shows nothing when nothing is open', () => {
    expect(shownWorkspace(none, 'brand')).toBeNull()
    expect(shownWorkspace(none, 'board')).toBeNull()
  })

  it('shows the one asked for when it is open', () => {
    expect(shownWorkspace({ brand: true, invoice: true, board: true }, 'board')).toBe('board')
    expect(shownWorkspace({ brand: true, invoice: true, board: true }, 'invoice')).toBe('invoice')
    expect(shownWorkspace({ ...none, brand: true }, 'brand')).toBe('brand')
  })

  it('shows another that is open when the one asked for is not', () => {
    expect(shownWorkspace({ ...none, invoice: true }, 'brand')).toBe('invoice')
    expect(shownWorkspace({ ...none, board: true }, 'invoice')).toBe('board')
    expect(shownWorkspace({ ...none, brand: true, board: true }, 'invoice')).toBe('brand')
  })
})
