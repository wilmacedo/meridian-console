import { describe, expect, it } from 'vitest'
import { nextOccurrence, parseRule } from './recurrence.js'

const at = (s: string): Date => new Date(s)
const next = (rule: string, anchor: string, after: string): string => {
  const d = nextOccurrence(parseRule(rule), at(anchor), at(after))
  return `${d.toLocaleDateString('sv-SE')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

describe('parseRule', () => {
  it('reads the forms a reminder needs', () => {
    expect(parseRule('FREQ=DAILY')).toEqual({ freq: 'DAILY', interval: 1 })
    expect(parseRule('freq=weekly;byday=mo,we')).toEqual({ freq: 'WEEKLY', interval: 1, byDay: [1, 3] })
    expect(parseRule('FREQ=MONTHLY;BYMONTHDAY=5;INTERVAL=2')).toEqual({ freq: 'MONTHLY', interval: 2, byMonthDay: 5 })
  })

  it('refuses what it does not understand, saying what it takes', () => {
    expect(() => parseRule('FREQ=YEARLY')).toThrow('FREQ must be DAILY, WEEKLY or MONTHLY')
    expect(() => parseRule('FREQ=WEEKLY;BYDAY=XX')).toThrow('"XX" is not a day')
    expect(() => parseRule('FREQ=DAILY;COUNT=3')).toThrow('COUNT is not supported')
    expect(() => parseRule('FREQ=WEEKLY;BYMONTHDAY=3')).toThrow('BYMONTHDAY is a day from 1 to 31, with FREQ=MONTHLY')
  })
})

describe('nextOccurrence', () => {
  it('keeps the time of day of the first occurrence', () => {
    expect(next('FREQ=DAILY', '2026-10-12T09:00', '2026-10-12T09:00')).toBe('2026-10-13 09:00')
    expect(next('FREQ=DAILY', '2026-10-12T09:00', '2026-10-12T08:00')).toBe('2026-10-12 09:00')
  })

  it('skips the weekend for working days', () => {
    // 2026-10-16 is a Friday.
    expect(next('FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR', '2026-10-12T08:30', '2026-10-16T09:00')).toBe('2026-10-19 08:30')
  })

  it('repeats on the weekdays given, or on the first one\'s, every so many weeks', () => {
    expect(next('FREQ=WEEKLY;BYDAY=MO,WE', '2026-10-12T20:00', '2026-10-12T21:00')).toBe('2026-10-14 20:00')
    expect(next('FREQ=WEEKLY', '2026-10-12T20:00', '2026-10-12T21:00')).toBe('2026-10-19 20:00')
    expect(next('FREQ=WEEKLY;INTERVAL=2', '2026-10-12T20:00', '2026-10-12T21:00')).toBe('2026-10-26 20:00')
  })

  it('repeats monthly on a day, skipping months that do not have it', () => {
    expect(next('FREQ=MONTHLY;BYMONTHDAY=5', '2026-10-05T10:00', '2026-10-05T11:00')).toBe('2026-11-05 10:00')
    expect(next('FREQ=MONTHLY', '2026-01-31T10:00', '2026-01-31T11:00')).toBe('2026-03-31 10:00')
  })
})
