import { hsvToRgb, rgbToHex } from './colour.ts'
import { RULE_IDS, TONE_COUNT, type Harmony } from './harmony.ts'
import type { PaletteBlock } from './palette.ts'
import { fixActions, makeMoreReadable } from './readability.ts'
import { docOf, reduce, selectedBlock, type WorkspaceAction, type WorkspaceState } from './workspaceState.ts'

// "Generate random": a random base colour and a random harmony, filled in on the colours that are not kept. The random source is a parameter (a function that
// gives a number from 0 up to, not including, 1), so the same source always gives the same palette and a test can choose it.

export type Random = () => number

const whole = (random: Random, count: number) => Math.min(count - 1, Math.floor(random() * count))

// A colour that is lively enough to build a palette on: any hue, saturation 45 to 90 percent, brightness 55 to 95 percent. Greys and near-blacks make a
// poor base, because the harmonies turn the hue and a grey has none to turn.
export function randomBase(random: Random): string {
  const h = random() * 360
  const s = 0.45 + random() * 0.45
  const v = 0.55 + random() * 0.4
  return rgbToHex(hsvToRgb({ h, s, v }))
}

export const randomHarmony = (random: Random): Harmony => RULE_IDS[whole(random, RULE_IDS.length)]

// The colour that takes the new base: the selected one, or the first that is not kept. Null when every colour is kept, so there is nothing to fill in.
export function baseTarget(blocks: PaletteBlock[], selectedId: number): PaletteBlock | null {
  const selected = blocks.find((block) => block.id === selectedId)
  if (selected && !selected.locked) return selected
  return blocks.find((block) => !block.locked) ?? null
}

// The one action that does it, which the workspace dispatches as a single undo step: it selects the colour that takes the base, gives it the base and fills
// in the others by a random rule, with a random arrangement of the tones. Null when every colour is kept.
export function randomPalette(blocks: PaletteBlock[], selectedId: number, random: Random = Math.random): WorkspaceAction | null {
  const target = baseTarget(blocks, selectedId)
  if (!target) return null
  const hex = randomBase(random)
  const harmony = randomHarmony(random)
  const variation = whole(random, TONE_COUNT)
  return {
    type: 'batch',
    actions: [
      { type: 'select', id: target.id },
      { type: 'set_hex', id: target.id, hex },
      { type: 'use_harmony', harmony, fromId: target.id, variation },
    ],
  }
}

// The same, but never a palette whose text cannot be read: if the random colours leave the text failing AA on the background, the text (or the background)
// is moved in the same batch until it passes, so the founder always starts from something usable and Undo takes back all of it.
export function readableRandomPalette(state: WorkspaceState, random: Random = Math.random): WorkspaceAction | null {
  const doc = docOf(state)
  const action = randomPalette(doc.blocks, selectedBlock(state).id, random)
  if (!action || action.type !== 'batch') return action
  const after = docOf(reduce(state, action)).blocks
  const fix = makeMoreReadable(after)
  return fix ? { type: 'batch', actions: [...action.actions, ...fixActions(after, fix)] } : action
}
