import type { ProjectMemory } from './memorySave.ts'
import { specColours, type SpecColour } from './logoHandoff.ts'
import type { PaletteSave } from './paletteSave.ts'
import { currentFacts } from './projectMemory.ts'

// What a logo brief and the handoff card are drawn from, read out of what the project holds: the business name, the saved palette's colours and the
// fonts the founder chose. Nothing here comes from the model.
export type Brand = { name: string; colours: SpecColour[]; fontsFact?: string }

export function brandOf(input: { memory: ProjectMemory; palette: PaletteSave | null }): Brand {
  const { memory, palette } = input
  const name = (memory.idea?.name || memory.business?.details.name || '').trim()
  const fonts = currentFacts(memory)['brand.fonts']
  return { name, colours: specColours(palette), ...(fonts ? { fontsFact: fonts } : {}) }
}
