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
  it('saves and loads a palette per project', async () => {
    await savePalette('duckstack', data)
    expect(await loadPalette('duckstack')).toMatchObject(data)
    expect(await loadPalette('typography')).toBeNull()
  })

  it('keeps the order of the tools in the toolbar', async () => {
    await savePalette('duckstack', { ...data, tools: ['generate', 'picker', 'role'] })
    expect((await loadPalette('duckstack'))?.tools).toEqual(['generate', 'picker', 'role'])
    await savePalette('duckstack', data)
    expect((await loadPalette('duckstack'))?.tools).toBeUndefined()
  })

  it('keeps the role given to a colour', async () => {
    const withRoles = { ...data, blocks: [{ id: 1, hex: '#1F8FE0', role: 'primary' as const }, { id: 2, hex: '#0B4F8A' }] }
    await savePalette('duckstack', withRoles)
    expect((await loadPalette('duckstack'))?.blocks[0].role).toBe('primary')
    expect((await loadPalette('duckstack'))?.blocks[1].role).toBeUndefined()
  })

  it('keeps which tools were dragged out of the toolbar to be windows', async () => {
    await savePalette('duckstack', { ...data, expanded: ['picker'] })
    expect((await loadPalette('duckstack'))?.expanded).toEqual(['picker'])
    await savePalette('duckstack', data)
    expect((await loadPalette('duckstack'))?.expanded).toBeUndefined()
  })

  it('still loads a save from when tools had versions, and ignores them', async () => {
    window.localStorage.setItem(
      'droplet-project-duckstack-palette',
      JSON.stringify({ ...data, sizes: { picker: 1 }, savedAt: new Date().toISOString() }),
    )
    expect(await loadPalette('duckstack')).toMatchObject(data)
    expect(await loadPalette('duckstack')).not.toHaveProperty('sizes')
  })

  it('rejects a role that does not exist', async () => {
    window.localStorage.setItem(
      'droplet-project-duckstack-palette',
      JSON.stringify({ blocks: [{ id: 1, hex: '#1F8FE0', role: 'headline' }], layout: [], savedAt: new Date().toISOString() }),
    )
    expect(await loadPalette('duckstack')).toBeNull()
  })

  it('stamps when it was saved', async () => {
    const save = await savePalette('duckstack', data)
    expect(Number.isNaN(Date.parse(save!.savedAt))).toBe(false)
  })

  it('ignores corrupt or invalid stored data', async () => {
    window.localStorage.setItem('droplet-project-duckstack-palette', 'not json')
    expect(await loadPalette('duckstack')).toBeNull()
    window.localStorage.setItem(
      'droplet-project-duckstack-palette',
      JSON.stringify({ blocks: [{ id: 1, hex: 'red' }], layout: [], savedAt: 'x' }),
    )
    expect(await loadPalette('duckstack')).toBeNull()
  })

  it('rejects more than eight colours', async () => {
    const blocks = Array.from({ length: 9 }, (_, i) => ({ id: i, hex: '#000000' }))
    window.localStorage.setItem(
      'droplet-project-duckstack-palette',
      JSON.stringify({ blocks, layout: [], savedAt: new Date().toISOString() }),
    )
    expect(await loadPalette('duckstack')).toBeNull()
  })

  it('clears a saved palette', async () => {
    await savePalette('duckstack', data)
    await clearPalette('duckstack')
    expect(await loadPalette('duckstack')).toBeNull()
  })
})
