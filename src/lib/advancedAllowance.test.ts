import { describeAllowance, describeReturn } from './advancedAllowance.ts'

// Local times, so the same wording comes out whatever the machine's time zone.
const at = (hours: number, minutes: number, day = 6) => new Date(2026, 9, day, hours, minutes)

describe('when an Advanced answer comes back', () => {
  it('says the time, in the founder\'s own clock, and "tomorrow" when it is another day', () => {
    const now = at(12, 0)
    expect(describeReturn(at(14, 20).toISOString(), now)).toBe('back at 14:20')
    expect(describeReturn(at(2, 5, 7).toISOString(), now)).toBe('back tomorrow at 02:05')
  })

  it('says nothing when there is nothing to say', () => {
    expect(describeReturn(null)).toBeNull()
    expect(describeReturn('not a date')).toBeNull()
  })
})

describe('the Advanced row of the mode menu', () => {
  const now = at(12, 0)

  it('says what Advanced does and how many are left, when the server says', () => {
    expect(describeAllowance({ advancedLeft: 7, advancedLimit: 10, resetsAt: at(9, 0).toISOString() }, now)).toEqual({ text: 'Searches the web · 7 of 10 left today', exhausted: false })
    expect(describeAllowance({ advancedLeft: 10, advancedLimit: 10, resetsAt: null }, now).text).toBe('Searches the web · 10 of 10 left today')
  })

  it('says it is spent, and when one comes back, when none are left', () => {
    expect(describeAllowance({ advancedLeft: 0, advancedLimit: 10, resetsAt: at(14, 20).toISOString() }, now)).toEqual({ text: 'None left today · back at 14:20', exhausted: true })
    expect(describeAllowance({ advancedLeft: 0, advancedLimit: 10, resetsAt: null }, now)).toEqual({ text: 'None left today', exhausted: true })
  })

  it('says Advanced is not available when it is switched off', () => {
    expect(describeAllowance({ advancedLeft: 0, advancedLimit: 0, resetsAt: null }, now)).toEqual({ text: 'Not available', exhausted: true })
  })

  it('stays usable with no count: the server still holds the limit', () => {
    expect(describeAllowance(null, now)).toEqual({ text: 'Searches the web', exhausted: false })
  })
})
