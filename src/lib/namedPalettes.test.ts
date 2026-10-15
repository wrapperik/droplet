import { DEFAULT_PALETTE_NAME, NAMED_PALETTES_MAX, PALETTE_NAME_MAX, checkPaletteName, findById, findByName, nameOfBlocks, newestFirst, removeNamed, sameName, tidyName, upsertNamed, type NamedPalette } from './namedPalettes.ts'
import type { PaletteBlock } from './palette.ts'

const blocks = (hex = '#1F8FE0'): PaletteBlock[] => [
  { id: 1, hex, role: 'primary' },
  { id: 2, hex: '#0E1A2B' },
]
let counter = 0
const makeId = () => `id-${++counter}`

describe('names', () => {
  it('tidies spaces and compares without capitals or spaces at the ends', () => {
    expect(tidyName('  My   colour theme ')).toBe('My colour theme')
    expect(sameName(' My Colour Theme', 'my colour   theme ')).toBe(true)
    expect(sameName('Spring', 'Summer')).toBe(false)
  })

  it('wants 1 to 60 characters once tidied, and says what to do', () => {
    expect(DEFAULT_PALETTE_NAME).toBe('My colour theme')
    expect(checkPaletteName('  Spring  ')).toEqual({ ok: true, name: 'Spring' })
    expect(checkPaletteName('   ')).toEqual({ ok: false, reason: 'Give the palette a name.' })
    expect(checkPaletteName('x'.repeat(PALETTE_NAME_MAX))).toMatchObject({ ok: true })
    expect(checkPaletteName('x'.repeat(PALETTE_NAME_MAX + 1))).toMatchObject({ ok: false, reason: expect.stringContaining('60') })
  })
})

describe('upsertNamed', () => {
  it('keeps a new palette at the end with its own id and the time it was kept', () => {
    const first = upsertNamed([], { name: 'Spring', blocks: blocks() }, '2026-10-01T10:00:00.000Z', makeId)
    expect(first).toMatchObject({ ok: true, replaced: false, entry: { name: 'Spring', savedAt: '2026-10-01T10:00:00.000Z' } })
    if (!first.ok) throw new Error('unreachable')
    const second = upsertNamed(first.list, { name: 'Summer', blocks: blocks('#B5543A') }, '2026-10-02T10:00:00.000Z', makeId)
    if (!second.ok) throw new Error('unreachable')
    expect(second.list.map((entry) => entry.name)).toEqual(['Spring', 'Summer'])
    expect(new Set(second.list.map((entry) => entry.id)).size).toBe(2)
  })

  it('replaces a palette of the same name, whatever the capitals and spaces, in its place and with its id', () => {
    const list: NamedPalette[] = [
      { id: 'a', name: 'Spring', blocks: blocks(), savedAt: '2026-10-01T10:00:00.000Z' },
      { id: 'b', name: 'Summer', blocks: blocks(), savedAt: '2026-10-01T10:00:00.000Z' },
    ]
    const result = upsertNamed(list, { name: '  spring ', blocks: blocks('#B5543A') }, '2026-10-05T10:00:00.000Z', makeId)
    if (!result.ok) throw new Error('unreachable')
    expect(result.replaced).toBe(true)
    expect(result.list).toHaveLength(2)
    expect(result.list[0]).toMatchObject({ id: 'a', name: 'spring', savedAt: '2026-10-05T10:00:00.000Z' })
    expect(result.list[0].blocks[0].hex).toBe('#B5543A')
    expect(result.list[1]).toBe(list[1])
  })

  it('does not change the list or the colours it was given', () => {
    const list: NamedPalette[] = []
    const input = blocks()
    const result = upsertNamed(list, { name: 'Spring', blocks: input })
    if (!result.ok) throw new Error('unreachable')
    expect(list).toEqual([])
    expect(result.entry.blocks).not.toBe(input)
  })

  it('refuses a name that cannot be used', () => {
    expect(upsertNamed([], { name: ' ', blocks: blocks() })).toEqual({ ok: false, reason: 'Give the palette a name.' })
  })

  it('keeps at most twenty, refuses a twenty-first with what to do, and still lets one be replaced', () => {
    let list: NamedPalette[] = []
    for (let i = 0; i < NAMED_PALETTES_MAX; i += 1) {
      const result = upsertNamed(list, { name: `Palette ${i}`, blocks: blocks() }, '2026-10-01T10:00:00.000Z', makeId)
      if (!result.ok) throw new Error('unreachable')
      list = result.list
    }
    const refused = upsertNamed(list, { name: 'One too many', blocks: blocks() })
    expect(refused).toMatchObject({ ok: false, reason: expect.stringContaining('Forget one first') })
    expect(upsertNamed(list, { name: 'palette 3', blocks: blocks('#B5543A') })).toMatchObject({ ok: true, replaced: true })
  })
})

describe('finding and listing', () => {
  const list: NamedPalette[] = [
    { id: 'a', name: 'Spring', blocks: blocks(), savedAt: '2026-10-01T10:00:00.000Z' },
    { id: 'b', name: 'Summer', blocks: blocks('#B5543A'), savedAt: '2026-10-03T10:00:00.000Z' },
    { id: 'c', name: 'Autumn', blocks: blocks('#F0A030'), savedAt: '2026-10-03T10:00:00.000Z' },
  ]

  it('finds a palette by name or id, and forgets one', () => {
    expect(findByName(list, ' SPRING')?.id).toBe('a')
    expect(findByName(list, 'Winter')).toBeUndefined()
    expect(findById(list, 'b')?.name).toBe('Summer')
    expect(removeNamed(list, 'b').map((entry) => entry.id)).toEqual(['a', 'c'])
    expect(removeNamed(list, 'zzz')).toHaveLength(3)
  })

  it('lists the newest first, then by name, without changing the list', () => {
    expect(newestFirst(list).map((entry) => entry.name)).toEqual(['Autumn', 'Summer', 'Spring'])
    expect(list.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
  })

  it('says what a palette is called when its colours are exactly those of a kept one', () => {
    expect(nameOfBlocks(list, blocks('#B5543A'))).toBe('Summer')
    expect(nameOfBlocks(list, blocks('#000000'))).toBeNull()
  })
})
