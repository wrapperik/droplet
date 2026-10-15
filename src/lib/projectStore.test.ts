import { clearPalette, forgetNamedPalette, loadPalette, markPaletteExported, savePalette } from './projectStore.ts'
import { paletteSaveSchema } from './paletteSave.ts'

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

  it('reads a save that has no layout', async () => {
    window.localStorage.setItem('droplet-project-duckstack-palette', JSON.stringify({ blocks: [{ id: 1, hex: '#1F8FE0' }], savedAt: 'x' }))
    expect(await loadPalette('duckstack')).toMatchObject({ blocks: [{ id: 1, hex: '#1F8FE0' }] })
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

describe('named palettes', () => {
  const entry = (id: string, name: string, hex = '#1F8FE0') => ({ id, name, blocks: [{ id: 1, hex }, { id: 2, hex: '#0B4F8A' }], savedAt: '2026-10-01T10:00:00.000Z' })

  it('keeps the palettes the founder named with the working palette', async () => {
    await savePalette('duckstack', { ...data, palettes: [entry('a', 'Spring'), entry('b', 'Summer', '#B5543A')] })
    const loaded = await loadPalette('duckstack')
    expect(loaded?.palettes?.map((palette) => palette.name)).toEqual(['Spring', 'Summer'])
    expect(loaded?.palettes?.[1].blocks[0].hex).toBe('#B5543A')
  })

  it('still reads a save from before there were any, and a save that does not mention them keeps the ones there are', async () => {
    window.localStorage.setItem('droplet-project-duckstack-palette', JSON.stringify({ blocks: [{ id: 1, hex: '#1F8FE0' }], savedAt: 'x' }))
    expect((await loadPalette('duckstack'))?.palettes).toBeUndefined()
    await savePalette('duckstack', { ...data, palettes: [entry('a', 'Spring')] })
    await savePalette('duckstack', { blocks: [{ id: 1, hex: '#B5543A' }, { id: 2, hex: '#000000' }] })
    const loaded = await loadPalette('duckstack')
    expect(loaded?.blocks[0].hex).toBe('#B5543A')
    expect(loaded?.palettes?.map((palette) => palette.id)).toEqual(['a'])
  })

  it('keeps them when the palette is marked as exported', async () => {
    await savePalette('duckstack', { ...data, palettes: [entry('a', 'Spring')] })
    await markPaletteExported('duckstack', '2026-10-09T10:00:00.000Z')
    expect((await loadPalette('duckstack'))?.palettes).toHaveLength(1)
  })

  it('accepts at most twenty, and a name of 1 to 60 characters', () => {
    const base = { ...data, savedAt: 'x' }
    expect(paletteSaveSchema.safeParse({ ...base, palettes: Array.from({ length: 20 }, (_, i) => entry(`id${i}`, `P${i}`)) }).success).toBe(true)
    expect(paletteSaveSchema.safeParse({ ...base, palettes: Array.from({ length: 21 }, (_, i) => entry(`id${i}`, `P${i}`)) }).success).toBe(false)
    expect(paletteSaveSchema.safeParse({ ...base, palettes: [entry('a', '')] }).success).toBe(false)
    expect(paletteSaveSchema.safeParse({ ...base, palettes: [entry('a', 'x'.repeat(61))] }).success).toBe(false)
  })

  it('forgets one, and leaves the working palette and the others, and does not count as a save', async () => {
    await savePalette('duckstack', { ...data, palettes: [entry('a', 'Spring'), entry('b', 'Summer')] })
    const before = (await loadPalette('duckstack'))!
    expect(await forgetNamedPalette('duckstack', 'a')).toBe(true)
    const after = (await loadPalette('duckstack'))!
    expect(after.palettes?.map((palette) => palette.id)).toEqual(['b'])
    expect(after.blocks).toEqual(before.blocks)
    expect(after.savedAt).toBe(before.savedAt)
    expect(await forgetNamedPalette('duckstack', 'b')).toBe(true)
    expect((await loadPalette('duckstack'))?.palettes).toBeUndefined()
  })

  it('has nothing to forget when there is no such palette or no save', async () => {
    expect(await forgetNamedPalette('duckstack', 'a')).toBe(false)
    await savePalette('duckstack', { ...data, palettes: [entry('a', 'Spring')] })
    expect(await forgetNamedPalette('duckstack', 'zzz')).toBe(false)
  })
})
