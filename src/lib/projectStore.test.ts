import { clearPalette, loadPalette, savePalette } from './projectStore.ts'

const data = {
  blocks: [
    { id: 1, hex: '#1F8FE0' },
    { id: 2, hex: '#0B4F8A' },
  ],
  layout: [{ id: 'canvas', col: 3, row: 0, w: 6 }],
}

beforeEach(() => window.localStorage.clear())

describe('projectStore', () => {
  it('saves and loads a palette per project', () => {
    savePalette('duckstack', data)
    expect(loadPalette('duckstack')).toMatchObject(data)
    expect(loadPalette('typography')).toBeNull()
  })

  it('keeps the order of the tools in the toolbar', () => {
    savePalette('duckstack', { ...data, tools: ['generate', 'picker', 'role'] })
    expect(loadPalette('duckstack')?.tools).toEqual(['generate', 'picker', 'role'])
    savePalette('duckstack', data)
    expect(loadPalette('duckstack')?.tools).toBeUndefined()
  })

  it('keeps the role given to a colour', () => {
    const withRoles = { ...data, blocks: [{ id: 1, hex: '#1F8FE0', role: 'primary' as const }, { id: 2, hex: '#0B4F8A' }] }
    savePalette('duckstack', withRoles)
    expect(loadPalette('duckstack')?.blocks[0].role).toBe('primary')
    expect(loadPalette('duckstack')?.blocks[1].role).toBeUndefined()
  })

  it('keeps which tools were dragged out of the toolbar to be windows', () => {
    savePalette('duckstack', { ...data, expanded: ['picker'] })
    expect(loadPalette('duckstack')?.expanded).toEqual(['picker'])
    savePalette('duckstack', data)
    expect(loadPalette('duckstack')?.expanded).toBeUndefined()
  })

  it('still loads a save from when tools had versions, and ignores them', () => {
    window.localStorage.setItem(
      'droplet-project-duckstack-palette',
      JSON.stringify({ ...data, sizes: { picker: 1 }, savedAt: new Date().toISOString() }),
    )
    expect(loadPalette('duckstack')).toMatchObject(data)
    expect(loadPalette('duckstack')).not.toHaveProperty('sizes')
  })

  it('rejects a role that does not exist', () => {
    window.localStorage.setItem(
      'droplet-project-duckstack-palette',
      JSON.stringify({ blocks: [{ id: 1, hex: '#1F8FE0', role: 'headline' }], layout: [], savedAt: new Date().toISOString() }),
    )
    expect(loadPalette('duckstack')).toBeNull()
  })

  it('stamps when it was saved', () => {
    const save = savePalette('duckstack', data)
    expect(Number.isNaN(Date.parse(save!.savedAt))).toBe(false)
  })

  it('ignores corrupt or invalid stored data', () => {
    window.localStorage.setItem('droplet-project-duckstack-palette', 'not json')
    expect(loadPalette('duckstack')).toBeNull()
    window.localStorage.setItem(
      'droplet-project-duckstack-palette',
      JSON.stringify({ blocks: [{ id: 1, hex: 'red' }], layout: [], savedAt: 'x' }),
    )
    expect(loadPalette('duckstack')).toBeNull()
  })

  it('rejects more than eight colours', () => {
    const blocks = Array.from({ length: 9 }, (_, i) => ({ id: i, hex: '#000000' }))
    window.localStorage.setItem(
      'droplet-project-duckstack-palette',
      JSON.stringify({ blocks, layout: [], savedAt: new Date().toISOString() }),
    )
    expect(loadPalette('duckstack')).toBeNull()
  })

  it('clears a saved palette', () => {
    savePalette('duckstack', data)
    clearPalette('duckstack')
    expect(loadPalette('duckstack')).toBeNull()
  })
})
