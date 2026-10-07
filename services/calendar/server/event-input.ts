import type { EventBody } from './google-client.js'

export interface EventInput {
  title?: string
  // A timed event: ISO instants with an offset (or Z).
  start?: string
  end?: string
  // An all-day event: `date` is the first day and `endDate` the last (inclusive, defaults to `date`).
  date?: string
  endDate?: string
  location?: string
}

const OFFSET = /(Z|[+-]\d{2}:?\d{2})$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_LENGTH_MS = 60 * 60_000

export const addDays = (day: string, days: number): string => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function validDay(value: string, name: string): string {
  if (!DAY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error(`${name} must be a day as YYYY-MM-DD`)
  return value
}

function instant(value: string, name: string): string {
  if (!OFFSET.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${name} must be an ISO date-time with a UTC offset, e.g. 2026-10-08T15:00:00-03:00`)
  return new Date(value).toISOString()
}

// Builds what Google expects. A change (`patch`) that moves an event between timed and all-day must clear the
// other form's field, which Google reads as null.
export function buildEventBody(input: EventInput, mode: 'create' | 'patch'): EventBody {
  const body: EventBody = {}
  const patch = mode === 'patch'

  if (input.title !== undefined) body.summary = input.title
  if (input.location !== undefined) body.location = input.location

  if (input.date !== undefined) {
    if (input.start !== undefined || input.end !== undefined) throw new Error('give either date (all-day) or start/end (timed), not both')
    const first = validDay(input.date, 'date')
    const last = validDay(input.endDate ?? first, 'endDate')
    if (last < first) throw new Error('endDate cannot be before date')
    body.start = { date: first, ...(patch ? { dateTime: null } : {}) }
    body.end = { date: addDays(last, 1), ...(patch ? { dateTime: null } : {}) }
  } else if (input.start !== undefined || input.end !== undefined) {
    if (input.endDate !== undefined) throw new Error('endDate goes with date (all-day), not with start/end')
    if (input.start === undefined) throw new Error('give start together with end')
    const start = instant(input.start, 'start')
    if (input.end === undefined && patch) throw new Error('give start together with end')
    const end = input.end === undefined ? new Date(Date.parse(start) + DEFAULT_LENGTH_MS).toISOString() : instant(input.end, 'end')
    if (Date.parse(end) <= Date.parse(start)) throw new Error('end must be after start')
    body.start = { dateTime: start, ...(patch ? { date: null } : {}) }
    body.end = { dateTime: end, ...(patch ? { date: null } : {}) }
  } else if (input.endDate !== undefined) {
    throw new Error('endDate goes with date')
  }

  if (mode === 'create' && (!body.summary || !body.start)) throw new Error('an event needs a title and a time (start, or date for all-day)')
  if (patch && Object.keys(body).length === 0) throw new Error('nothing to change')
  return body
}
