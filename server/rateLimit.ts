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

export const DAY_MS = 24 * 60 * 60 * 1000

// A founder's daily allowance of Advanced answers, over a sliding 24 hours. Only an answer the Advanced model gave counts: a request Quick answered
// because Google's model was busy costs the founder nothing. `status` says how many have been used and when the oldest was given (so when one comes
// back), and may be asynchronous: the Edge Function reads its `compositions` table, and records the use in the row it writes, so its `spend` does
// nothing. The dev server counts requests to this server.
export type AdvancedUse = { used: number; oldestAt: number | null }
export type AdvancedAllowance = {
  limit: number
  status: () => AdvancedUse | Promise<AdvancedUse>
  spend: () => void | Promise<void>
}

export function createAdvancedAllowance(limit: number, windowMs = DAY_MS, now: () => number = Date.now): AdvancedAllowance {
  let times: number[] = []
  const recent = () => {
    const current = now()
    times = times.filter((time) => current - time < windowMs)
    return times
  }
  return {
    limit,
    status() {
      const live = recent()
      return { used: live.length, oldestAt: live[0] ?? null }
    },
    spend() {
      recent().push(now())
    },
  }
}
