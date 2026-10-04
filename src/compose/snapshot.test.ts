import { docOf, openWorkspace, reduce } from '../lib/workspaceState.ts'
import { snapshotOfState, stateOfSnapshot } from './snapshot.ts'
import { workspaceSnapshotSchema } from './spec.ts'

const state = () =>
  reduce(openWorkspace([{ id: 1, hex: '#1F8FE0', name: 'Blue' }, { id: 2, hex: '#CFE9FB' }, { id: 3, hex: '#0E1A2B', role: 'text', locked: true }]), { type: 'select', id: 2 })

describe('snapshots', () => {
  it('sends the tools in the toolbar left to right, leaving out the ones that are hidden', () => {
    const moved = reduce(reduce(state(), { type: 'move_tool', id: 'generate', before: 'picker' }), { type: 'hide', component: 'role' })
    const snapshot = snapshotOfState(moved, null, 'none')
    expect(snapshot.tools).toEqual(['generate', 'picker'])
    expect(docOf(stateOfSnapshot(snapshot)).tools).toEqual(['generate', 'picker', 'role'])
  })

  it('describes the workspace in a form the request schema accepts', () => {
    const snapshot = snapshotOfState(state(), null, 'unsaved')
    expect(workspaceSnapshotSchema.safeParse(snapshot).success).toBe(true)
    expect(snapshot).toMatchObject({ selectedId: 2, harmony: 'analogous', saved: 'unsaved', canUndo: false, canRedo: false })
    expect(snapshot.blocks[2]).toEqual({ id: 3, hex: '#0E1A2B', role: 'text', locked: true })
  })

  it('uses the drawn layout and leaves out what is hidden', () => {
    const hidden = reduce(state(), { type: 'hide', component: 'preview' })
    const snapshot = snapshotOfState(hidden, [{ id: 'canvas', col: 0, row: 10, w: 24 }, { id: 'preview', col: 0, row: 40, w: 12 }], 'none')
    expect(snapshot.hidden).toEqual(['preview'])
    expect(snapshot.tools).toEqual(['picker', 'role', 'generate'])
    expect(snapshot.layout.map((p) => p.id)).toEqual(['canvas'])
    expect(snapshot.canUndo).toBe(true)
  })

  it('rebuilds a workspace from a snapshot, with undo and redo allowed only as they were', () => {
    const rebuilt = stateOfSnapshot({ ...snapshotOfState(state(), null, 'none'), canUndo: true, canRedo: false })
    expect(docOf(rebuilt).blocks).toHaveLength(3)
    expect(rebuilt.selectedId).toBe(2)
    expect(rebuilt.history.past).toHaveLength(1)
    expect(rebuilt.history.future).toHaveLength(0)
  })
})
