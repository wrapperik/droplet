import { openSnapshot } from './fixtures.ts'
import { describeWorkspace } from './context.ts'

type Described = {
  colours: { number: number; hex: string; role?: string; kept?: boolean; selected?: boolean; contrastOnBackgroundColour: string }[]
  selectedColour: number
  roles: Record<string, { colour: number; chosenByFounder: boolean }>
  textOnBackground: { ratio: string; verdict: string }
  pairsReachingAA: string
  harmony: string
  components: { id: string; onScreen: boolean; size?: string }[]
  arrangement: { toolbar: string[]; windows: string[][] }
  saved: string
}
const describe_ = (snapshot = openSnapshot()) => describeWorkspace(snapshot) as unknown as Described

describe('describeWorkspace', () => {
  it('numbers the colours from 1 and marks the selected one', () => {
    const d = describe_()
    expect(d.colours.map((c) => c.number)).toEqual([1, 2, 3, 4])
    expect(d.colours.filter((c) => c.selected).map((c) => c.number)).toEqual([1])
    expect(d.selectedColour).toBe(1)
  })

  it('moves the selection when another colour is selected, and shows kept colours and roles the founder chose', () => {
    const snapshot = openSnapshot()
    const d = describe_({ ...snapshot, selectedId: 3, blocks: snapshot.blocks.map((b) => (b.id === 4 ? { ...b, locked: true, role: 'text' as const } : b)) })
    expect(d.selectedColour).toBe(3)
    expect(d.colours[3]).toMatchObject({ kept: true, role: 'text' })
    expect(d.roles.text).toEqual({ colour: 4, chosenByFounder: true })
    expect(d.roles.background.chosenByFounder).toBe(false)
  })

  it('computes contrast in code, so the model can quote it', () => {
    const d = describe_()
    expect(d.textOnBackground.ratio).toMatch(/^\d+\.\d:1$/)
    expect(d.textOnBackground.verdict).toBe('passes AAA')
    expect(d.pairsReachingAA).toBe('3 of 6')
    expect(d.colours[2].contrastOnBackgroundColour).toBe('1.0:1')
  })

  it('says which components are on screen, how big they are, and how they are arranged', () => {
    const d = describe_()
    expect(d.components.find((c) => c.id === 'canvas')).toMatchObject({ onScreen: true, size: 'full width' })
    expect(d.components.find((c) => c.id === 'preview')).toMatchObject({ onScreen: true, size: 'half the width' })
    expect(d.components.find((c) => c.id === 'picker')).toMatchObject({ onScreen: true, form: 'tool in the toolbar' })
    expect(d.components.find((c) => c.id === 'canvas')).toMatchObject({ form: 'window' })
    expect(d.arrangement).toEqual({ toolbar: ['picker', 'role', 'generate'], windows: [['canvas'], ['preview']] })
  })

  it('shows a hidden component as off screen, and a tool that has been made a window as a window', () => {
    const snapshot = openSnapshot()
    const d = describe_({
      ...snapshot,
      hidden: ['preview'],
      tools: ['role', 'generate'],
      expanded: ['picker'],
      layout: [...snapshot.layout.filter((p) => p.id !== 'preview'), { id: 'picker', col: 0, row: 20, w: 10 }],
    })
    expect(d.components.find((c) => c.id === 'preview')).toEqual(expect.objectContaining({ onScreen: false }))
    expect(d.components.find((c) => c.id === 'preview')?.size).toBeUndefined()
    expect(d.components.find((c) => c.id === 'picker')).toMatchObject({ onScreen: true, form: 'window' })
    expect(d.arrangement).toEqual({ toolbar: ['role', 'generate'], windows: [['canvas'], ['picker']] })
  })

  it('passes on the history and save state', () => {
    expect(describe_({ ...openSnapshot(), canUndo: true, saved: 'unsaved' }).saved).toBe('unsaved')
  })
})
