import { MERGE_WINDOW_MS, canRedo, canUndo, commit, createHistory, redo, undo } from './history.ts'

describe('history', () => {
  it('starts with nothing to undo or redo', () => {
    const history = createHistory('a')
    expect(canUndo(history)).toBe(false)
    expect(canRedo(history)).toBe(false)
  })

  it('undoes and redoes a change', () => {
    const changed = commit(createHistory('a'), 'b')
    expect(changed.present).toBe('b')
    const back = undo(changed)
    expect(back.present).toBe('a')
    expect(redo(back).present).toBe('b')
  })

  it('drops the redo steps when something new is done after undoing', () => {
    const history = commit(commit(createHistory('a'), 'b'), 'c')
    const branched = commit(undo(history), 'x')
    expect(branched.present).toBe('x')
    expect(canRedo(branched)).toBe(false)
    expect(undo(branched).present).toBe('b')
  })

  it('merges quick edits under the same key into one step', () => {
    let history = createHistory('a')
    history = commit(history, 'b', 'colour', 1000)
    history = commit(history, 'c', 'colour', 1100)
    history = commit(history, 'd', 'colour', 1200)
    expect(history.past).toEqual(['a'])
    expect(undo(history).present).toBe('a')
  })

  it('starts a new step after a pause, or under a different key', () => {
    let history = commit(createHistory('a'), 'b', 'colour', 1000)
    history = commit(history, 'c', 'colour', 1000 + MERGE_WINDOW_MS + 1)
    expect(history.past).toEqual(['a', 'b'])
    history = commit(history, 'd', 'role', 1000 + MERGE_WINDOW_MS + 2)
    expect(history.past).toEqual(['a', 'b', 'c'])
  })

  it('never merges edits that have no key', () => {
    let history = commit(createHistory('a'), 'b', null, 1000)
    history = commit(history, 'c', null, 1001)
    expect(history.past).toEqual(['a', 'b'])
  })

  it('ignores a commit that changes nothing, and undo or redo at the ends', () => {
    const history = createHistory('a')
    expect(commit(history, 'a')).toBe(history)
    expect(undo(history)).toBe(history)
    expect(redo(history)).toBe(history)
  })

  it('keeps only the most recent steps', () => {
    let history = createHistory(0)
    for (let i = 1; i <= 150; i += 1) history = commit(history, i)
    expect(history.past.length).toBe(100)
    expect(history.present).toBe(150)
  })
})
