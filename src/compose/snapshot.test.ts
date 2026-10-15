import { docOf, openWorkspace, reduce } from '../lib/workspaceState.ts'
import { snapshotOfState, stateOfSnapshot } from './snapshot.ts'
import { workspaceSnapshotSchema } from './spec.ts'

const state = () =>
  reduce(openWorkspace([{ id: 1, hex: '#1F8FE0', name: 'Blue' }, { id: 2, hex: '#CFE9FB' }, { id: 3, hex: '#0E1A2B', role: 'text', locked: true }]), { type: 'select', id: 2 })

describe('snapshots', () => {
  it('does not send how the screen is arranged, whatever the workspace holds', () => {
    const moved = reduce(reduce(state(), { type: 'move_tool', id: 'generate', before: 'picker' }), { type: 'hide', component: 'role' })
    const snapshot = snapshotOfState(moved, 'none')
    for (const key of ['tools', 'expanded', 'hidden', 'layout']) expect(snapshot).not.toHaveProperty(key)
    expect(docOf(stateOfSnapshot(snapshot)).tools).toEqual(['picker', 'role', 'generate'])
  })

  it('describes the workspace in a form the request schema accepts', () => {
    const snapshot = snapshotOfState(state(), 'unsaved')
    expect(workspaceSnapshotSchema.safeParse(snapshot).success).toBe(true)
    expect(snapshot).toMatchObject({ selectedId: 2, harmony: 'analogous', saved: 'unsaved', canUndo: false, canRedo: false })
    expect(snapshot.blocks[2]).toEqual({ id: 3, hex: '#0E1A2B', role: 'text', locked: true })
  })

  it('still accepts the arrangement fields an older browser sends, and ignores them', () => {
    const old = { ...snapshotOfState(state(), 'none'), hidden: ['preview'], expanded: ['picker'], tools: ['role'], layout: [{ id: 'canvas', col: 0, row: 0, w: 24 }] }
    expect(workspaceSnapshotSchema.safeParse(old).success).toBe(true)
    const rebuilt = docOf(stateOfSnapshot(old))
    expect(rebuilt.hidden).toEqual([])
    expect(rebuilt.expanded).toEqual([])
    expect(rebuilt.tools).toEqual(['picker', 'role', 'generate'])
  })

  it('rebuilds a workspace from a snapshot, with undo and redo allowed only as they were', () => {
    const rebuilt = stateOfSnapshot({ ...snapshotOfState(state(), 'none'), canUndo: true, canRedo: false })
    expect(docOf(rebuilt).blocks).toHaveLength(3)
    expect(rebuilt.selectedId).toBe(2)
    expect(rebuilt.history.past).toHaveLength(1)
    expect(rebuilt.history.future).toHaveLength(0)
  })
})
