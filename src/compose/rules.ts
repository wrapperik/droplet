import { openWorkspace } from '../lib/workspaceState.ts'
import { applyTurnActions } from './applyActions.ts'
import { stateOfSnapshot } from './snapshot.ts'
import type { Turn, WorkspaceSnapshot } from './spec.ts'

// Business rules for a turn, checked in code after the shape is right. The actions are tried against the workspace
// the founder is looking at, through the same code that will apply them, so anything that could not be done is
// caught here, with a reason written to be sent back to the model if it has to try again.

export function checkTurn(turn: Turn, workspace?: WorkspaceSnapshot): string[] {
  if (turn.actions.length === 0) return []

  // Only a brand turn touches the workspace. Anything else is a conversation.
  if (turn.task !== 'brand') {
    return [`Only a brand task may include actions. Leave actions empty for the task "${turn.task}", and put your answer in the message.`]
  }

  const result = applyTurnActions({
    base: workspace ? stateOfSnapshot(workspace) : null,
    open: (blocks) => openWorkspace(blocks),
    actions: turn.actions,
    env: { layout: workspace?.layout ?? [], heights: {} },
  })
  return result.skipped.map((skipped) => `Action ${skipped.position + 1} (${skipped.action.type}): ${skipped.reason}`)
}
