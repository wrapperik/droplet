// The line above an empty chat, chosen from the time of day: a plain greeting through the day and a light remark in the small hours, the early
// morning and late in the evening. It says nothing about the founder's work, so it needs nothing but the clock and, if there is one, a first name.

// The first word of a name, or nothing when there is no name to use.
export function firstName(name: string | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? ''
}

export function timeGreeting(date: Date, name = ''): string {
  const hour = date.getHours()
  const to = name ? `, ${name}` : ''
  if (hour < 5) return 'Late night sesh?'
  if (hour < 7) return 'Early bird?'
  if (hour < 12) return `Good morning${to}`
  if (hour < 17) return `Good afternoon${to}`
  if (hour < 21) return `Good evening${to}`
  return 'Working late?'
}
