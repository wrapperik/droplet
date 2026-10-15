import { hexToRgb, contrastRatio } from './colour.ts'
import { MAX_FAVOURITES, OPTIONS_PER_ROUND, cleanFavourites, isOption, paletteOptions } from './paletteOptions.ts'
import { COLOUR_ROLES, resolveRoles } from './palette.ts'
import { MAX_BLOCKS, MIN_BLOCKS } from './workspaceState.ts'

const SETS = [['#1F8FE0'], ['#E4572E'], ['#808080'], ['#FFFFFF'], ['#000000'], ['#1F8FE0', '#E4572E'], ['#1F8FE0', '#2A9D8F'], ['#7B2D8E', '#F4A261', '#2A9D8F'], ['#112233', '#112244', '#112255']]

describe('cleanFavourites', () => {
  it('normalises, drops invalid and repeated colours, and keeps at most three', () => {
    expect(cleanFavourites(['1f8fe0', '#1F8FE0', 'nope', '#abc'])).toEqual(['#1F8FE0', '#AABBCC'])
    expect(cleanFavourites(['#111111', '#222222', '#333333', '#444444'])).toHaveLength(MAX_FAVOURITES)
    expect(cleanFavourites([])).toEqual([])
  })
})

describe('paletteOptions', () => {
  it('gives nothing without a favourite', () => {
    expect(paletteOptions([], 0)).toEqual([])
    expect(paletteOptions(['not a colour'], 0)).toEqual([])
  })

  it('gives three options a round, for any favourites and any of the first rounds', () => {
    for (const favourites of SETS) for (let round = 0; round < 8; round += 1) expect(paletteOptions(favourites, round)).toHaveLength(OPTIONS_PER_ROUND)
  })

  it('is deterministic', () => {
    for (const favourites of SETS) expect(paletteOptions(favourites, 1)).toEqual(paletteOptions(favourites, 1))
  })

  it('makes valid palettes: 2 to 8 valid colours with all four roles set once', () => {
    for (const favourites of SETS) {
      for (let round = 0; round < 3; round += 1) {
        for (const option of paletteOptions(favourites, round)) {
          expect(option.blocks.length).toBeGreaterThanOrEqual(MIN_BLOCKS)
          expect(option.blocks.length).toBeLessThanOrEqual(MAX_BLOCKS)
          for (const block of option.blocks) expect(block.hex).toMatch(/^#[0-9A-F]{6}$/)
          expect(new Set(option.blocks.map((block) => block.id)).size).toBe(option.blocks.length)
          for (const role of COLOUR_ROLES) expect(option.blocks.filter((block) => block.role === role.id)).toHaveLength(1)
          expect(resolveRoles(option.blocks)).toBeTruthy()
        }
      }
    }
  })

  it('keeps every favourite in every option, and the first favourite as the primary when there is only one', () => {
    for (const favourites of SETS) {
      for (let round = 0; round < 3; round += 1) {
        for (const option of paletteOptions(favourites, round)) {
          const hexes = option.blocks.map((block) => block.hex)
          for (const favourite of cleanFavourites(favourites)) expect(hexes).toContain(favourite)
          if (favourites.length === 1) expect(option.blocks.find((block) => block.role === 'primary')!.hex).toBe(cleanFavourites(favourites)[0])
        }
      }
    }
  })

  it('puts each favourite as the primary of one option when there are two or three', () => {
    for (const favourites of [['#1F8FE0', '#E4572E'], ['#7B2D8E', '#F4A261', '#2A9D8F']]) {
      const primaries = paletteOptions(favourites, 0).map((option) => option.blocks.find((block) => block.role === 'primary')!.hex)
      for (const favourite of favourites) expect(primaries).toContain(favourite)
    }
  })

  it('makes options that differ from each other, within a round and across rounds', () => {
    for (const favourites of SETS) {
      const ids = [0, 1, 2, 3].flatMap((round) => paletteOptions(favourites, round).map((option) => option.id))
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('uses different harmonies for the three options of one favourite', () => {
    const titles = paletteOptions(['#1F8FE0'], 0).map((option) => option.title)
    expect(new Set(titles).size).toBe(3)
  })

  it('has text that reads on the background at AA in every option, and says so', () => {
    for (const favourites of SETS) {
      for (let round = 0; round < 3; round += 1) {
        for (const option of paletteOptions(favourites, round)) {
          const roles = resolveRoles(option.blocks)
          const ratio = contrastRatio(hexToRgb(roles.text.hex), hexToRgb(roles.background.hex))
          expect(ratio).toBeGreaterThanOrEqual(4.5)
          expect(option.textOnBackground.level).not.toBe('fail')
          expect(roles.text.chosen && roles.background.chosen && roles.primary.chosen && roles.accent.chosen).toBe(true)
        }
      }
    }
  })

  it('recognises the option the workspace has', () => {
    const [first, second] = paletteOptions(['#1F8FE0'], 0)
    expect(isOption(first, first.blocks)).toBe(true)
    expect(isOption(first, second.blocks)).toBe(false)
  })
})
