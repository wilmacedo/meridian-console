import { describe, expect, it } from 'vitest'
import { parseRange, whenText } from './calendar-actions.js'
import type { CalendarEvent } from './google-client.js'

const NOW = new Date(2026, 9, 7, 17, 30)
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('parseRange', () => {
  it('defaults to today and the six days after it', () => {
    expect(parseRange(undefined, undefined, NOW)).toEqual({ from: day(2026, 10, 7), to: day(2026, 10, 14) })
  })

  it('covers just the day when only a date is given', () => {
    expect(parseRange('2026-10-08', undefined, NOW)).toEqual({ from: day(2026, 10, 8), to: day(2026, 10, 9) })
  })

  it('includes the last day when "to" is a date', () => {
    expect(parseRange('2026-10-08', '2026-10-09', NOW)).toEqual({ from: day(2026, 10, 8), to: day(2026, 10, 10) })
  })

  it('refuses a backwards range and an unreadable one', () => {
    expect(() => parseRange('2026-10-09', '2026-10-08', NOW)).toThrow(/after/)
    expect(() => parseRange('tomorrow', undefined, NOW)).toThrow(/YYYY-MM-DD/)
  })
})

describe('whenText', () => {
  const base: CalendarEvent = { id: 'a', sourceId: 's', title: 't', start: '', end: '', allDay: false, uid: 'u', alsoIn: [] }

  it('names the days of an all-day event, ending on the last day and not the exclusive end', () => {
    expect(whenText({ ...base, allDay: true, start: '2026-10-08', end: '2026-10-09' })).toBe('Thu 08 Oct, all day')
    expect(whenText({ ...base, allDay: true, start: '2026-10-08', end: '2026-10-11' })).toBe('Thu 08 Oct to Sat 10 Oct, all day')
  })
})
