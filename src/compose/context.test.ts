import { openSnapshot } from './fixtures.ts'
import { describeWorkspace } from './context.ts'

type Described = {
  colours: { number: number; hex: string; role?: string; kept?: boolean; selected?: boolean; contrastOnBackgroundColour: string }[]
  selectedColour: number
  roles: Record<string, { colour: number; chosenByFounder: boolean }>
  textOnBackground: { ratio: string; verdict: string }
  pairsReachingAA: string
  harmony: string
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

  it('says nothing about components or how the screen is arranged', () => {
    const d = describe_()
    expect(d).not.toHaveProperty('components')
    expect(d).not.toHaveProperty('arrangement')
    expect(JSON.stringify(d)).not.toMatch(/toolbar|window/)
  })

  it('passes on the history and save state', () => {
    expect(describe_({ ...openSnapshot(), canUndo: true, saved: 'unsaved' }).saved).toBe('unsaved')
  })
})
