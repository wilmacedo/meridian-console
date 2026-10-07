import { describe, expect, it } from 'vitest'
import { addD, durTxt, eventsOn, isoWeek, layoutLanes, monOf, monthGrid, relTxt, toCalEvent, type CalEvent } from './calendar-time.js'

const ev = (id: string, start: Date, end: Date, allDay = false): CalEvent => ({ id, sourceId: 's', title: id, start, end, allDay, alsoIn: [] })
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m)

describe('dates', () => {
  it('finds the Monday of a week, Sunday included', () => {
    expect(monOf(new Date(2026, 9, 7))).toEqual(new Date(2026, 9, 5))
    expect(monOf(new Date(2026, 9, 11))).toEqual(new Date(2026, 9, 5))
    expect(monOf(new Date(2026, 9, 5))).toEqual(new Date(2026, 9, 5))
  })

  it('numbers ISO weeks across a year end', () => {
    expect(isoWeek(new Date(2026, 9, 7))).toBe(41)
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1)
    expect(isoWeek(new Date(2024, 11, 30))).toBe(1)
  })

  it('formats lengths and the time until an event like the design', () => {
    expect(durTxt(45)).toBe('45m')
    expect(durTxt(60)).toBe('1h')
    expect(durTxt(95)).toBe('1h 35m')
    const e = { start: at(7, 15), end: at(7, 16) }
    expect(relTxt(e, at(7, 14, 35))).toBe('IN 25M')
    expect(relTxt(e, at(7, 12))).toBe('IN 3H 00M')
    expect(relTxt(e, at(7, 15, 30))).toBe('NOW')
    expect(relTxt(e, at(7, 16))).toBe('ENDED')
    expect(relTxt(e, at(4, 15))).toBe('IN 3D')
  })

  it('lays the month out in whole weeks starting on Monday', () => {
    const { base, days } = monthGrid(new Date(2026, 9, 7), 0)
    expect(base).toEqual(new Date(2026, 9, 1))
    expect(days).toHaveLength(35)
    expect(days[0]).toEqual(new Date(2026, 8, 28))
    expect(days.at(-1)).toEqual(new Date(2026, 10, 1))
    expect(monthGrid(new Date(2026, 9, 7), 1).base).toEqual(new Date(2026, 10, 1))
  })
})

describe('events', () => {
  it('reads an all-day event as local days with the exclusive end', () => {
    const e = toCalEvent({ id: 'a', sourceId: 's', title: 'Home', start: '2026-10-07', end: '2026-10-08', allDay: true, alsoIn: [] })
    expect(e.start).toEqual(new Date(2026, 9, 7))
    expect(e.end).toEqual(new Date(2026, 9, 8))
  })

  it('puts a multi-day all-day event on each of its days and not the day after', () => {
    const trip = ev('trip', new Date(2026, 9, 9), new Date(2026, 9, 12), true)
    expect([8, 9, 10, 11, 12].map((d) => eventsOn([trip], new Date(2026, 9, d)).length)).toEqual([0, 1, 1, 1, 0])
  })

  it('shows an event that crosses midnight on both days, all-day first', () => {
    const late = ev('late', at(8, 23), at(9, 1))
    const home = ev('home', new Date(2026, 9, 9), new Date(2026, 9, 10), true)
    expect(eventsOn([late, home], new Date(2026, 9, 9)).map((e) => e.id)).toEqual(['home', 'late'])
    expect(eventsOn([late], new Date(2026, 9, 8))).toHaveLength(1)
  })

  it('shares the width of overlapping events and frees it again afterwards', () => {
    const laid = layoutLanes([ev('a', at(8, 9), at(8, 11)), ev('b', at(8, 10), at(8, 12)), ev('c', at(8, 13), at(8, 14))])
    expect(laid.map((e) => [e.id, e.lane, e.lanes])).toEqual([['a', 0, 2], ['b', 1, 2], ['c', 0, 1]])
  })

  it('gives a short event the room its drawn block takes', () => {
    const laid = layoutLanes([ev('a', at(8, 15, 30), at(8, 15, 40)), ev('b', at(8, 15, 45), at(8, 15, 55))])
    expect(laid.map((e) => [e.lane, e.lanes])).toEqual([[0, 2], [1, 2]])
  })

  it('keeps the original events untouched', () => {
    const a = ev('a', at(8, 9), at(8, 10))
    layoutLanes([a])
    expect('lane' in a).toBe(false)
    expect(addD(a.start, 1).getDate()).toBe(9)
  })
})
