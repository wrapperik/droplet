import { describe, expect, it } from 'vitest'
import { firstName, timeGreeting } from './greeting.ts'

const at = (hour: number, minute = 0) => new Date(2026, 9, 9, hour, minute)

describe('the greeting above an empty chat', () => {
  it('remarks on the small hours and the early morning, without the name', () => {
    expect(timeGreeting(at(0), 'Rikus')).toBe('Late night sesh?')
    expect(timeGreeting(at(4, 59), 'Rikus')).toBe('Late night sesh?')
    expect(timeGreeting(at(5), 'Rikus')).toBe('Early bird?')
    expect(timeGreeting(at(6, 59), 'Rikus')).toBe('Early bird?')
  })

  it('greets plainly through the day, with the name', () => {
    expect(timeGreeting(at(7), 'Rikus')).toBe('Good morning, Rikus')
    expect(timeGreeting(at(11, 59), 'Rikus')).toBe('Good morning, Rikus')
    expect(timeGreeting(at(12), 'Rikus')).toBe('Good afternoon, Rikus')
    expect(timeGreeting(at(16, 59), 'Rikus')).toBe('Good afternoon, Rikus')
    expect(timeGreeting(at(17), 'Rikus')).toBe('Good evening, Rikus')
    expect(timeGreeting(at(20, 59), 'Rikus')).toBe('Good evening, Rikus')
  })

  it('asks if they are working late towards the end of the evening', () => {
    expect(timeGreeting(at(21), 'Rikus')).toBe('Working late?')
    expect(timeGreeting(at(23, 59))).toBe('Working late?')
  })

  it('has no name to use when there is none', () => {
    expect(timeGreeting(at(9))).toBe('Good morning')
    expect(timeGreeting(at(14), '')).toBe('Good afternoon')
  })

  it('takes the first word of a name', () => {
    expect(firstName('Megan Swart')).toBe('Megan')
    expect(firstName('  rikush60 ')).toBe('rikush60')
    expect(firstName('')).toBe('')
    expect(firstName(undefined)).toBe('')
  })

  it('has no em dashes at any hour', () => {
    for (let hour = 0; hour < 24; hour++) expect(timeGreeting(at(hour), 'Megan')).not.toMatch(/—|–/)
  })
})
