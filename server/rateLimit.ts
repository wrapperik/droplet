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

// How many requests may still search the web. `allowed` says whether this one may; `spend` records the searches it made. The Edge Function counts
// rows in the database instead, so its `spend` does nothing and the row it writes says whether the request searched.
export type SearchAllowance = { allowed: () => boolean | Promise<boolean>; spend: (searches: number) => void | Promise<void> }

// For the dev server: so many searched requests in a sliding day, on this machine. A limit of 0 never searches.
export function createSearchAllowance(perDay: number, windowMs = 24 * 60 * 60 * 1000, now: () => number = Date.now): SearchAllowance {
  let times: number[] = []
  return {
    allowed() {
      const current = now()
      times = times.filter((time) => current - time < windowMs)
      return times.length < perDay
    },
    spend(searches) {
      if (searches > 0) times.push(now())
    },
  }
}
