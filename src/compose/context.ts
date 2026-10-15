import { contrastRatio, hexToRgb } from '../lib/colour.ts'
import { resolveRoles, summarisePairs } from '../lib/palette.ts'
import { COLOUR_ROLES, type WorkspaceSnapshot } from './spec.ts'

// What the model is shown about the workspace: the founder's own view of it, in words and numbers the model can
// reason with. The contrast figures are computed here, in code, so the model quotes them and never has to guess.

const verdict = (ratio: number) => (ratio >= 7 ? 'passes AAA' : ratio >= 4.5 ? 'passes AA' : 'fails AA')
const figure = (ratio: number) => `${ratio.toFixed(1)}:1`

export function describeWorkspace(snapshot: WorkspaceSnapshot): Record<string, unknown> {
  const blocks = snapshot.blocks
  const roles = resolveRoles(blocks)
  const numberOf = (blockId: number) => blocks.findIndex((b) => b.id === blockId) + 1
  const ratio = (a: string, b: string) => contrastRatio(hexToRgb(a), hexToRgb(b))
  const key = ratio(roles.text.hex, roles.background.hex)
  const { total, passing } = summarisePairs(blocks)

  return {
    colours: blocks.map((b, i) => ({
      number: i + 1,
      hex: b.hex,
      ...(b.name ? { name: b.name } : {}),
      ...(b.role ? { role: b.role } : {}),
      ...(b.locked ? { kept: true } : {}),
      ...(b.id === snapshot.selectedId ? { selected: true } : {}),
      contrastOnBackgroundColour: figure(ratio(b.hex, roles.background.hex)),
    })),
    selectedColour: Math.max(1, numberOf(snapshot.selectedId)),
    roles: Object.fromEntries(
      COLOUR_ROLES.map((role) => [role, { colour: numberOf(roles[role].blockId), chosenByFounder: roles[role].chosen }]),
    ),
    textOnBackground: { ratio: figure(key), verdict: verdict(key) },
    pairsReachingAA: `${passing} of ${total}`,
    harmony: snapshot.harmony,
    canUndo: snapshot.canUndo,
    canRedo: snapshot.canRedo,
    saved: snapshot.saved,
  }
}
