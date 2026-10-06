import { useCallback, useEffect, useState } from 'react'
import type { Allowance } from '../compose/spec.ts'
import { fetchAllowance } from './composeClient.ts'

// What the Advanced row of the mode menu says, from the server's count of the founder's Advanced answers. The count is the server's: the browser only
// shows it. With no count (the server could not say, or has not been asked yet) the row says what Advanced does and stays usable, and the server still
// holds the limit.

const pad = (value: number) => String(value).padStart(2, '0')

// When one comes back, in the founder's own time: "14:20", or "tomorrow at 02:10" when that is on another day.
export function describeReturn(resetsAt: string | null, now: Date = new Date()): string | null {
  if (!resetsAt) return null
  const when = new Date(resetsAt)
  if (Number.isNaN(when.getTime())) return null
  const time = `${pad(when.getHours())}:${pad(when.getMinutes())}`
  return when.toDateString() === now.toDateString() ? `back at ${time}` : `back tomorrow at ${time}`
}

export type AllowanceNote = { text: string; exhausted: boolean }

export function describeAllowance(allowance: Allowance | null, now: Date = new Date()): AllowanceNote {
  if (!allowance) return { text: 'Searches the web', exhausted: false }
  if (allowance.advancedLimit === 0) return { text: 'Not available', exhausted: true }
  if (allowance.advancedLeft <= 0) {
    const back = describeReturn(allowance.resetsAt, now)
    return { text: back ? `None left today · ${back}` : 'None left today', exhausted: true }
  }
  return { text: `Searches the web · ${allowance.advancedLeft} of ${allowance.advancedLimit} left today`, exhausted: false }
}

// The founder's allowance as the server last said it: asked once when the screen opens, and replaced by what every answer carries.
export function useAdvancedAllowance(): [Allowance | null, (allowance: Allowance | undefined) => void] {
  const [allowance, setAllowance] = useState<Allowance | null>(null)
  useEffect(() => {
    let current = true
    void fetchAllowance().then((found) => {
      // An answer that arrived first is newer than this.
      if (current && found) setAllowance((existing) => existing ?? found)
    })
    return () => {
      current = false
    }
  }, [])
  const update = useCallback((next: Allowance | undefined) => {
    if (next) setAllowance(next)
  }, [])
  return [allowance, update]
}
