import { describe, expect, it } from 'vitest'
import { calendarTile, type TileEvent } from './calendar-tile'

const at = (h: number, m = 0): Date => new Date(2026, 9, 8, h, m)
const event = (title: string, start: Date, end: Date): TileEvent => ({ title, start, end, color: '#abc' })

describe('calendarTile', () => {
  it('shows the next event with how far off it is', () => {
    const t = calendarTile([event('Sprint planning', at(15), at(16))], at(14, 2))
    expect(t).toMatchObject({ kicker: 'NEXT · 15:00', value: 'Sprint planning', valueSize: 'text', sub: 'IN 58M', accent: '#abc' })
    expect(t.bar).toBeUndefined()
  })

  it('shows what is on now with the time left and the progress', () => {
    const t = calendarTile([event('Review', at(14), at(15))], at(14, 15))
    expect(t).toMatchObject({ kicker: 'NOW', value: 'Review', sub: '45 min left', bar: { value: 25 } })
  })

  it('prefers what is on now over what comes next', () => {
    const t = calendarTile([event('Review', at(14), at(15)), event('Later', at(16), at(17))], at(14, 30))
    expect(t.value).toBe('Review')
  })

  it('never says zero minutes left', () => {
    expect(calendarTile([event('Review', at(14), at(15))], new Date(2026, 9, 8, 14, 59, 50)).sub).toBe('1 min left')
  })

  it('says the day is clear once everything has ended', () => {
    expect(calendarTile([event('Done', at(9), at(10))], at(14))).toMatchObject({ kicker: 'TODAY', value: 'All clear', sub: 'Nothing left today' })
    expect(calendarTile([], at(14)).value).toBe('All clear')
  })

  it('has a placeholder for an event without a title', () => {
    expect(calendarTile([event('', at(15), at(16))], at(14)).value).toBe('(sem título)')
  })
})
