import { describe, expect, it } from 'vitest'
import { addDays, buildEventBody } from './event-input.js'

describe('buildEventBody', () => {
  it('builds a timed event, defaulting the length to one hour', () => {
    expect(buildEventBody({ title: 'Lunch', start: '2026-10-08T12:30:00-03:00' }, 'create')).toEqual({
      summary: 'Lunch',
      start: { dateTime: '2026-10-08T15:30:00.000Z' },
      end: { dateTime: '2026-10-08T16:30:00.000Z' },
    })
  })

  it('builds an all-day event with Google\'s exclusive end, over several days', () => {
    expect(buildEventBody({ title: 'Trip', date: '2026-10-09', endDate: '2026-10-11' }, 'create')).toEqual({ summary: 'Trip', start: { date: '2026-10-09' }, end: { date: '2026-10-12' } })
    expect(buildEventBody({ title: 'Day off', date: '2026-12-31' }, 'create').end).toEqual({ date: '2027-01-01' })
  })

  it('refuses a time without an offset, an end before the start, and mixing the two forms', () => {
    expect(() => buildEventBody({ title: 'x', start: '2026-10-08T12:30:00' }, 'create')).toThrow(/UTC offset/)
    expect(() => buildEventBody({ title: 'x', start: '2026-10-08T12:30:00Z', end: '2026-10-08T12:00:00Z' }, 'create')).toThrow(/after start/)
    expect(() => buildEventBody({ title: 'x', date: '2026-10-08', start: '2026-10-08T12:30:00Z' }, 'create')).toThrow(/not both/)
    expect(() => buildEventBody({ title: 'x', date: '08/10/2026' }, 'create')).toThrow(/YYYY-MM-DD/)
    expect(() => buildEventBody({ title: 'x', date: '2026-10-09', endDate: '2026-10-08' }, 'create')).toThrow(/before/)
  })

  it('needs a title and a time to create', () => {
    expect(() => buildEventBody({ title: 'x' }, 'create')).toThrow(/title and a time/)
    expect(() => buildEventBody({ start: '2026-10-08T12:30:00Z' }, 'create')).toThrow(/title and a time/)
  })

  it('patches only what changed, and clears the other form when the kind changes', () => {
    expect(buildEventBody({ title: 'New name' }, 'patch')).toEqual({ summary: 'New name' })
    expect(buildEventBody({ date: '2026-10-09' }, 'patch')).toEqual({ start: { date: '2026-10-09', dateTime: null }, end: { date: '2026-10-10', dateTime: null } })
    expect(buildEventBody({ start: '2026-10-08T10:00:00Z', end: '2026-10-08T11:00:00Z' }, 'patch').start).toEqual({ dateTime: '2026-10-08T10:00:00.000Z', date: null })
    expect(() => buildEventBody({ start: '2026-10-08T10:00:00Z' }, 'patch')).toThrow(/together/)
    expect(() => buildEventBody({}, 'patch')).toThrow(/nothing to change/)
  })

  it('adds days across month and year ends', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})
