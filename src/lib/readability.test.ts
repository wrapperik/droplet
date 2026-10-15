import { contrastRatio, hexToRgb, hslToRgb, rgbToHex, rgbToHsl } from './colour.ts'
import { resolveRoles, type PaletteBlock } from './palette.ts'
import { AA_RATIO, fixActions, makeMoreReadable, readableAgainst } from './readability.ts'
import { openWorkspace, reduce, docOf, canUndoState } from './workspaceState.ts'

const ratioOf = (blocks: PaletteBlock[]) => {
  const roles = resolveRoles(blocks)
  return contrastRatio(hexToRgb(roles.text.hex), hexToRgb(roles.background.hex))
}

describe('hsl', () => {
  it('round-trips colours', () => {
    for (const hex of ['#1F8FE0', '#0E1A2B', '#CFE9FB', '#FFFFFF', '#000000', '#808080', '#E4572E']) {
      expect(rgbToHex(hslToRgb(rgbToHsl(hexToRgb(hex))))).toBe(hex)
    }
  })
})

describe('readableAgainst', () => {
  it('leaves a colour that already reads', () => {
    expect(readableAgainst('#0E1A2B', '#F4F8FB')).toBe('#0E1A2B')
  })

  it('moves the colour in lightness until it reads, keeping its hue', () => {
    const fixed = readableAgainst('#8AB4F8', '#FFFFFF')!
    expect(contrastRatio(hexToRgb(fixed), hexToRgb('#FFFFFF'))).toBeGreaterThanOrEqual(AA_RATIO)
    expect(Math.abs(rgbToHsl(hexToRgb(fixed)).h - rgbToHsl(hexToRgb('#8AB4F8')).h)).toBeLessThan(4)
  })

  it('goes lighter on a dark background', () => {
    const fixed = readableAgainst('#2A3A55', '#101820')!
    expect(rgbToHsl(hexToRgb(fixed)).l).toBeGreaterThan(rgbToHsl(hexToRgb('#2A3A55')).l)
    expect(contrastRatio(hexToRgb(fixed), hexToRgb('#101820'))).toBeGreaterThanOrEqual(AA_RATIO)
  })

  it('finds a colour for any background', () => {
    for (const background of ['#808080', '#777777', '#7F7F7F', '#9A9A9A', '#FF0000', '#00FF00']) {
      expect(readableAgainst('#7A7A7A', background)).not.toBeNull()
    }
  })
})

describe('makeMoreReadable', () => {
  const failing: PaletteBlock[] = [
    { id: 1, hex: '#1F8FE0', role: 'primary' },
    { id: 2, hex: '#0B4F8A', role: 'accent' },
    { id: 3, hex: '#CFE9FB', role: 'background' },
    { id: 4, hex: '#9CC3E6', role: 'text' },
  ]

  it('does nothing when the text already reads', () => {
    const ok: PaletteBlock[] = failing.map((block) => (block.role === 'text' ? { ...block, hex: '#0E1A2B' } : block))
    expect(makeMoreReadable(ok)).toBeNull()
  })

  it('moves the text colour first, until the pair passes', () => {
    expect(ratioOf(failing)).toBeLessThan(AA_RATIO)
    const fix = makeMoreReadable(failing)!
    expect(fix.moved).toBe('text')
    expect(fix.from).toBe('#9CC3E6')
    expect(ratioOf(fix.blocks)).toBeGreaterThanOrEqual(AA_RATIO)
    // Only the text changed.
    expect(fix.blocks.filter((block, index) => block.hex !== failing[index].hex).map((block) => block.id)).toEqual([4])
  })

  it('keeps the same colours as the text and the background when roles are only suggested', () => {
    const suggested: PaletteBlock[] = [
      { id: 1, hex: '#F2F2F2' },
      { id: 2, hex: '#D8D8D8' },
      { id: 3, hex: '#E6501E' },
    ]
    const before = resolveRoles(suggested)
    const fix = makeMoreReadable(suggested)
    if (fix) {
      const after = resolveRoles(fix.blocks)
      expect(after.text.blockId).toBe(before.text.blockId)
      expect(after.background.blockId).toBe(before.background.blockId)
      expect(ratioOf(fix.blocks)).toBeGreaterThanOrEqual(AA_RATIO)
    }
  })

  it('is one undo step when its actions are applied together', () => {
    let state = openWorkspace(failing)
    const fix = makeMoreReadable(failing)!
    state = reduce(state, { type: 'batch', actions: fixActions(docOf(state).blocks, fix) })
    expect(ratioOf(docOf(state).blocks)).toBeGreaterThanOrEqual(AA_RATIO)
    state = reduce(state, { type: 'undo' })
    expect(docOf(state).blocks.map((block) => block.hex)).toEqual(failing.map((block) => block.hex))
    expect(canUndoState(state)).toBe(false)
  })
})
