// A sliding-window limit on how many compositions can be asked for. The pitch counts a user's recent rows in the
// `compositions` table. Until there are users and a table, this counts requests to this server.
// `take` says whether one more composition may be asked for now. It may be asynchronous (the Edge Function counts rows in the database).
export type RateLimiter = { take: () => boolean | Promise<boolean> }

export function createRateLimiter(max: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  let times: number[] = []
  return {
    take() {
      const current = now()
      times = times.filter((time) => current - time < windowMs)
      if (times.length >= max) return false
      times.push(current)
      return true
    },
  }
}
