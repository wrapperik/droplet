// How Guide mode moves through the parts of a task, the same for every task (the invoice's six parts, the brand's three). A task gives its list of parts and where
// the founder is (the part on screen, and the furthest part reached, by its place); these functions do the moving. Continue goes on only once nothing holds the part
// back; Back always works; a part already reached can be gone back to and forward again as far as the founder got; one further on cannot be skipped to.

export type FlowProgress<S extends string> = { step: S; reached: number }

export const flowIndex = <S extends string>(steps: readonly S[], step: S) => steps.indexOf(step)

// Continue: the next part, if nothing holds this one back. The last part has nowhere to go; finishing it is the founder's own act.
export function flowAdvance<S extends string, P extends FlowProgress<S>>(steps: readonly S[], progress: P, blockedBy: readonly unknown[]): P {
  const index = flowIndex(steps, progress.step)
  if (blockedBy.length > 0 || index === steps.length - 1) return progress
  const next = index + 1
  return { ...progress, step: steps[next], reached: Math.max(progress.reached, next) }
}

export function flowBack<S extends string, P extends FlowProgress<S>>(steps: readonly S[], progress: P): P {
  const index = flowIndex(steps, progress.step)
  return index === 0 ? progress : { ...progress, step: steps[index - 1] }
}

export function flowGoTo<S extends string, P extends FlowProgress<S>>(steps: readonly S[], progress: P, step: S): P {
  return flowIndex(steps, step) <= progress.reached ? { ...progress, step } : progress
}

// Something outside the guide sends the founder to a part (a Fix button, Edit in the library). It counts as reached.
export function flowJumpTo<S extends string, P extends FlowProgress<S>>(steps: readonly S[], progress: P, step: S): P {
  return { ...progress, step, reached: Math.max(progress.reached, flowIndex(steps, step)) }
}
