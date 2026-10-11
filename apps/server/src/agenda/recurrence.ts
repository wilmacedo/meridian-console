import { fail } from './fields.js'

// The few RRULE forms a reminder needs ("todo dia", "dia útil", "toda segunda e quarta", "todo dia 5"), in the
// machine's local time. Anything else is refused, so a rule is never half understood.

export interface Rule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  interval: number
  // 0 is Sunday, as Date.getDay().
  byDay?: number[]
  byMonthDay?: number
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const DAY_MS = 86_400_000
// Far enough for a monthly rule on the 31st with an interval, short enough to stop a rule that never matches.
const MAX_DAYS_AHEAD = 800

export function parseRule(text: string): Rule {
  const parts = new Map(
    text
      .toUpperCase()
      .split(';')
      .filter(Boolean)
      .map((p) => p.split('=') as [string, string]),
  )
  const unknown = [...parts.keys()].filter((k) => !['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY'].includes(k))
  if (unknown.length) fail(`recurrence: ${unknown.join(', ')} is not supported; use FREQ (DAILY, WEEKLY, MONTHLY), INTERVAL, BYDAY or BYMONTHDAY`)
  const freq = parts.get('FREQ')
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') return fail('recurrence: FREQ must be DAILY, WEEKLY or MONTHLY')
  const interval = parts.has('INTERVAL') ? Number(parts.get('INTERVAL')) : 1
  if (!Number.isInteger(interval) || interval < 1 || interval > 52) fail('recurrence: INTERVAL must be a whole number from 1 to 52')
  const rule: Rule = { freq, interval }
  if (parts.has('BYDAY')) {
    if (freq === 'MONTHLY') fail('recurrence: BYDAY goes with DAILY or WEEKLY')
    rule.byDay = parts
      .get('BYDAY')!
      .split(',')
      .map((d) => (DAYS.includes(d) ? DAYS.indexOf(d) : fail(`recurrence: "${d}" is not a day; use MO, TU, WE, TH, FR, SA, SU`)))
  }
  if (parts.has('BYMONTHDAY')) {
    const day = Number(parts.get('BYMONTHDAY'))
    if (freq !== 'MONTHLY' || !Number.isInteger(day) || day < 1 || day > 31) fail('recurrence: BYMONTHDAY is a day from 1 to 31, with FREQ=MONTHLY')
    rule.byMonthDay = day
  }
  return rule
}

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())
// Whole local days between two dates, so a clock change does not shift the count.
const daysBetween = (a: Date, b: Date): number => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS)
// Weeks start on Monday, as the owner counts them.
const mondayOf = (d: Date): Date => {
  const day = startOfDay(d)
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7))
  return day
}

function matches(rule: Rule, anchor: Date, day: Date): boolean {
  switch (rule.freq) {
    case 'DAILY':
      return daysBetween(anchor, day) % rule.interval === 0 && (!rule.byDay || rule.byDay.includes(day.getDay()))
    case 'WEEKLY':
      return (daysBetween(mondayOf(anchor), mondayOf(day)) / 7) % rule.interval === 0 && (rule.byDay ?? [anchor.getDay()]).includes(day.getDay())
    case 'MONTHLY': {
      const months = (day.getFullYear() - anchor.getFullYear()) * 12 + day.getMonth() - anchor.getMonth()
      return months % rule.interval === 0 && day.getDate() === (rule.byMonthDay ?? anchor.getDate())
    }
  }
}

// The first occurrence after `after`. The anchor is the first occurrence: it gives the time of day and where
// the intervals count from.
export function nextOccurrence(rule: Rule, anchor: Date, after: Date): Date {
  const day = startOfDay(after > anchor ? after : anchor)
  for (let i = 0; i < MAX_DAYS_AHEAD; i++, day.setDate(day.getDate() + 1)) {
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), anchor.getHours(), anchor.getMinutes())
    if (at > after && at >= anchor && matches(rule, anchor, day)) return at
  }
  return fail('recurrence: it never happens again')
}
