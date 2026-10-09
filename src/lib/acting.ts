// How long the screen stays soft, with the loader on it, before what Droplet did lands. Long enough to be seen as Droplet doing something, short
// enough not to be waited for. With reduced motion the loader holds still, so the pause is shorter. Tests do not wait for it.
export const ACTING_MS = 900
export const ACTING_REDUCED_MS = 400

export function actingDelay(): number {
  if (import.meta.env.MODE === 'test') return 0
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? ACTING_REDUCED_MS : ACTING_MS
}

export const pause = (ms: number) => new Promise<void>((resolve) => (ms > 0 ? setTimeout(resolve, ms) : resolve()))
