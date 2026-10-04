import { contrastRatio, hexToRgb } from '../lib/colour.ts'
import { widthLabel } from '../lib/gridLayout.ts'
import { resolveRoles, summarisePairs } from '../lib/palette.ts'
import { COMPONENTS, kindOf } from '../lib/workspaceState.ts'
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

  const shown = new Set([...snapshot.layout.map((p) => p.id), ...snapshot.tools])
  const rows = new Map<number, typeof snapshot.layout>()
  for (const placement of snapshot.layout) rows.set(placement.row, [...(rows.get(placement.row) ?? []), placement])

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
    components: COMPONENTS.map((c) => {
      const placement = snapshot.layout.find((p) => p.id === c.id)
      const isTool = snapshot.tools.includes(c.id)
      return {
        id: c.id,
        name: c.label,
        onScreen: shown.has(c.id),
        // Where it is: in the toolbar, or a window on the grid.
        ...(shown.has(c.id) ? { form: isTool ? 'tool in the toolbar' : 'window', ...(placement ? { size: widthLabel(placement.w) } : {}) } : {}),
        kind: kindOf(c.id),
      }
    }),
    // The tools in the toolbar, left to right, and the windows on the grid: top to bottom, and left to right within a row.
    arrangement: {
      toolbar: snapshot.tools,
      windows: [...rows.entries()].sort(([a], [b]) => a - b).map(([, items]) => [...items].sort((a, b) => a.col - b.col).map((p) => p.id)),
    },
    canUndo: snapshot.canUndo,
    canRedo: snapshot.canRedo,
    saved: snapshot.saved,
  }
}
