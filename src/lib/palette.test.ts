import { assignRole, resolveRoles, summarisePairs, pairResult, withHex, type PaletteBlock } from './palette.ts'

const starter: PaletteBlock[] = [
  { id: 1, hex: '#1F8FE0' },
  { id: 2, hex: '#0B4F8A' },
  { id: 3, hex: '#CFE9FB' },
  { id: 4, hex: '#0E1A2B' },
]

describe('assignRole', () => {
  it('gives a colour a role', () => {
    expect(assignRole(starter, 1, 'primary')[0].role).toBe('primary')
  })

  it('moves a role from the colour that held it', () => {
    const first = assignRole(starter, 1, 'primary')
    const moved = assignRole(first, 2, 'primary')
    expect(moved.find((b) => b.id === 1)?.role).toBeUndefined()
    expect(moved.find((b) => b.id === 2)?.role).toBe('primary')
  })

  it('replaces a colour\'s own role, and clears it with null', () => {
    const first = assignRole(starter, 1, 'primary')
    expect(assignRole(first, 1, 'accent')[0].role).toBe('accent')
    expect('role' in assignRole(first, 1, null)[0]).toBe(false)
  })

  it('does not change the list it was given', () => {
    assignRole(starter, 1, 'primary')
    expect(starter[0].role).toBeUndefined()
  })
})

describe('resolveRoles', () => {
  it('suggests roles from the colours when none are chosen', () => {
    const roles = resolveRoles(starter)
    expect(roles.background).toMatchObject({ hex: '#CFE9FB', chosen: false })
    expect(roles.text).toMatchObject({ hex: '#0E1A2B', chosen: false })
    expect(roles.primary.hex).toBe('#1F8FE0')
    expect(roles.accent.hex).toBe('#0B4F8A')
  })

  it('keeps the founder\'s choices and marks them as chosen', () => {
    const roles = resolveRoles(assignRole(starter, 2, 'primary'))
    expect(roles.primary).toMatchObject({ hex: '#0B4F8A', chosen: true })
    expect(roles.accent.hex).not.toBe('#0B4F8A')
  })

  it('picks the text that reads best on a chosen background', () => {
    const roles = resolveRoles(assignRole(starter, 2, 'background'))
    expect(roles.background.hex).toBe('#0B4F8A')
    expect(roles.text.hex).toBe('#CFE9FB')
  })

  it('picks the background that reads best behind a chosen text colour', () => {
    const roles = resolveRoles(assignRole(starter, 3, 'text'))
    expect(roles.text.hex).toBe('#CFE9FB')
    expect(roles.background.hex).toBe('#0E1A2B')
  })

  it('never leaves a role without a colour, even with two colours', () => {
    const roles = resolveRoles(starter.slice(2))
    for (const role of Object.values(roles)) expect(role.hex).toMatch(/^#[0-9A-F]{6}$/)
    expect(roles.background.hex).toBe('#CFE9FB')
    expect(roles.text.hex).toBe('#0E1A2B')
  })

  it('uses each colour for one role while there are enough colours', () => {
    const roles = resolveRoles(starter)
    const ids = Object.values(roles).map((role) => role.blockId)
    expect(new Set(ids).size).toBe(4)
  })
})

describe('pairs', () => {
  it('reports the ratio and level for a pair, the same either way round', () => {
    const forward = pairResult('#0E1A2B', '#CFE9FB')
    const back = pairResult('#CFE9FB', '#0E1A2B')
    expect(forward.ratio).toBeCloseTo(back.ratio, 5)
    expect(forward.level).toBe('AAA')
    expect(pairResult('#1F8FE0', '#CFE9FB').level).toBe('fail')
  })

  it('counts the distinct pairs that reach AA', () => {
    const { total, passing } = summarisePairs(starter)
    expect(total).toBe(6)
    expect(passing).toBeGreaterThan(0)
    expect(passing).toBeLessThan(total)
  })
})

describe('withHex', () => {
  it('changes the colour and drops the name and note that described the old one', () => {
    const block: PaletteBlock = { id: 1, hex: '#1F8FE0', role: 'primary', locked: true, name: 'Sky', note: 'A friendly blue.' }
    expect(withHex(block, '#B5543A')).toEqual({ id: 1, hex: '#B5543A', role: 'primary', locked: true })
    expect(block.name).toBe('Sky')
  })
})
