import { newId } from './ids.ts'
import { NAMED_PALETTES_MAX, PALETTE_NAME_MAX, type NamedPalette } from './paletteSave.ts'
import type { PaletteBlock } from './palette.ts'
import { sameBlocks } from './workspaceState.ts'

// Palettes the founder has named and kept, so they can be opened later. Pure functions over the list a palette save holds: the interface and the library both
// use them, and nothing here reads or writes storage.

export { NAMED_PALETTES_MAX, PALETTE_NAME_MAX, type NamedPalette }
export const DEFAULT_PALETTE_NAME = 'My colour theme'

// Spaces at either end and runs of spaces inside do not make a different name.
export const tidyName = (name: string) => name.replace(/\s+/g, ' ').trim()
const keyOf = (name: string) => tidyName(name).toLowerCase()
export const sameName = (a: string, b: string) => keyOf(a) === keyOf(b)

// Whether a name can be used, and the tidied name if it can: 1 to 60 characters once tidied.
export function checkPaletteName(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  const name = tidyName(raw)
  if (name.length === 0) return { ok: false, reason: 'Give the palette a name.' }
  if (name.length > PALETTE_NAME_MAX) return { ok: false, reason: `Use ${PALETTE_NAME_MAX} characters or fewer for the name.` }
  return { ok: true, name }
}

export const findByName = (list: NamedPalette[], name: string) => list.find((entry) => sameName(entry.name, name))
export const findById = (list: NamedPalette[], id: string) => list.find((entry) => entry.id === id)

export type Upserted = { ok: true; list: NamedPalette[]; entry: NamedPalette; replaced: boolean } | { ok: false; reason: string }

// Keeps a palette under a name. A name that is already there (capitals and spaces ignored) is replaced in its place, keeping its id; a new name goes at the end.
// A twenty-first palette is refused with what to do.
export function upsertNamed(list: NamedPalette[], input: { name: string; blocks: PaletteBlock[] }, now: string = new Date().toISOString(), makeId: () => string = newId): Upserted {
  const checked = checkPaletteName(input.name)
  if (!checked.ok) return checked
  const blocks = input.blocks.map((block) => ({ ...block }))
  const existing = findByName(list, checked.name)
  if (existing) {
    const entry: NamedPalette = { id: existing.id, name: checked.name, blocks, savedAt: now }
    return { ok: true, list: list.map((other) => (other.id === existing.id ? entry : other)), entry, replaced: true }
  }
  if (list.length >= NAMED_PALETTES_MAX) return { ok: false, reason: `You can keep ${NAMED_PALETTES_MAX} palettes. Forget one first, or use the name of one to replace it.` }
  const entry: NamedPalette = { id: makeId(), name: checked.name, blocks, savedAt: now }
  return { ok: true, list: [...list, entry], entry, replaced: false }
}

export const removeNamed = (list: NamedPalette[], id: string): NamedPalette[] => list.filter((entry) => entry.id !== id)

// Newest first, for a list the founder looks through.
export const newestFirst = (list: NamedPalette[]): NamedPalette[] => [...list].sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.name.localeCompare(b.name))

// The name of the kept palette that has exactly these colours, if one does: what a palette that was just opened or read back is called.
export const nameOfBlocks = (list: NamedPalette[], blocks: PaletteBlock[]): string | null => list.find((entry) => sameBlocks(entry.blocks, blocks))?.name ?? null
