import { brandSheetData, brandSheetFilename } from './paletteExport.ts'
import { assignRole, resolveRoles, type PaletteBlock } from './palette.ts'

const blocks: PaletteBlock[] = [
  { id: 1, hex: '#1F8FE0', role: 'primary' },
  { id: 2, hex: '#0B4F8A' },
  { id: 3, hex: '#CFE9FB' },
  { id: 4, hex: '#0E1A2B' },
]

describe('brandSheetData', () => {
  const data = brandSheetData(blocks, resolveRoles(blocks), 'DuckStack', new Date('2026-10-02T09:00:00'))

  it('titles and dates the sheet', () => {
    expect(data.title).toBe('DuckStack colour palette')
    expect(data.date).toBe('2 October 2026')
  })

  it('gives each colour its hex and RGB values', () => {
    expect(data.colours[0]).toEqual({ name: 'Colour 1', role: 'Primary', hex: '#1F8FE0', rgb: '31, 143, 224' })
    expect(data.colours[1].role).toBeNull()
  })

  it('lists all four roles and says which were chosen', () => {
    expect(data.roles.map((role) => role.label)).toEqual(['Primary', 'Accent', 'Background', 'Text'])
    expect(data.roles.find((role) => role.label === 'Primary')?.chosen).toBe(true)
    expect(data.roles.find((role) => role.label === 'Text')?.chosen).toBe(false)
  })

  it('works out the key pair and the summary in code', () => {
    expect(data.keyPair).toMatchObject({ textHex: '#0E1A2B', backgroundHex: '#CFE9FB', verdict: 'Passes AAA' })
    expect(data.keyPair.ratio).toMatch(/^\d+\.\d:1$/)
    expect(data.summary).toMatch(/^\d+ of 6 pairs/)
  })

  it('says so when the key pair fails', () => {
    const failing = assignRole(assignRole(blocks, 1, 'background'), 3, 'text')
    expect(brandSheetData(failing, resolveRoles(failing), 'X', new Date()).keyPair.verdict).toBe('Fails AA')
  })
})

describe('brandSheetFilename', () => {
  it('makes a safe file name from the project name', () => {
    expect(brandSheetFilename('DuckStack')).toBe('duckstack-colour-palette.pdf')
    expect(brandSheetFilename('Kindred Gifting & Co.')).toBe('kindred-gifting-co-colour-palette.pdf')
    expect(brandSheetFilename('***')).toBe('project-colour-palette.pdf')
  })
})
