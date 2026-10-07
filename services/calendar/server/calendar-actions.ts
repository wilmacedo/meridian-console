import type { ServiceAction } from '@meridian/service-sdk/server'
import type { CalendarEvent } from './google-client.js'
import { getRuntime } from './runtime.js'

const DAY_MS = 24 * 3_600_000
const ONLY_DAY = /^\d{4}-\d{2}-\d{2}$/

function point(value: string, name: string, endOfDay: boolean): Date {
  if (ONLY_DAY.test(value)) {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number]
    return new Date(y, m - 1, d + (endOfDay ? 1 : 0))
  }
  const time = Date.parse(value)
  if (Number.isNaN(time)) throw new Error(`${name} must be YYYY-MM-DD or an ISO date-time`)
  return new Date(time)
}

// A date alone means the whole day in this machine's time zone, so "to: 2026-10-09" includes the 9th.
export function parseRange(from?: string, to?: string, now = new Date()): { from: Date; to: Date } {
  const start = from ? point(from, 'from', false) : new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = to ? point(to, 'to', true) : from ? (ONLY_DAY.test(from) ? point(from, 'from', true) : new Date(start.getTime() + DAY_MS)) : new Date(start.getTime() + 7 * DAY_MS)
  if (end <= start) throw new Error('to must be after from')
  return { from: start, to: end }
}

const clock = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
const hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

// The model reads this instead of doing time-zone arithmetic on the instants.
export function whenText(e: CalendarEvent): string {
  if (e.allDay) {
    const last = new Date(`${e.end}T00:00:00Z`)
    last.setUTCDate(last.getUTCDate() - 1)
    const a = day.format(new Date(`${e.start}T12:00:00Z`))
    const b = day.format(new Date(last.getTime() + 12 * 3_600_000))
    return `${a === b ? a : `${a} to ${b}`}, all day`
  }
  return `${clock.format(new Date(e.start))} to ${hm.format(new Date(e.end))}`
}

const EVENT_FIELDS = {
  title: { type: 'string', description: 'The event title' },
  start: { type: 'string', description: 'Timed event: start as an ISO date-time WITH a UTC offset, e.g. 2026-10-08T15:00:00-03:00' },
  end: { type: 'string', description: 'Timed event: end, same format; defaults to one hour after start' },
  date: { type: 'string', description: 'All-day event: the first day as YYYY-MM-DD (use instead of start/end)' },
  endDate: { type: 'string', description: 'All-day event: the last day as YYYY-MM-DD, inclusive; defaults to date' },
  location: { type: 'string', description: 'Where it takes place' },
} as const

interface EventArgs {
  title?: string
  start?: string
  end?: string
  date?: string
  endDate?: string
  location?: string
}

export const calendarActions: ServiceAction<never>[] = [
  {
    id: 'list-calendars',
    method: 'GET',
    path: '/calendars',
    title: 'List calendars',
    description: 'Every connected Google calendar with its account, whether it is shown, whether it can be written to, and which one is the default for new events',
    mutating: false,
    run: async () => {
      const { store, service } = getRuntime()
      const accounts = new Map(store.accounts().map((a) => [a.id, a]))
      return store.sources().map((s) => ({
        calendar: s.label,
        account: accounts.get(s.accountId)?.email,
        needsSignIn: accounts.get(s.accountId)?.status === 'pending',
        shown: s.visible,
        writable: s.accessRole === 'owner' || s.accessRole === 'writer',
        default: s.isDefault,
        id: s.id,
        name: service.describe(s),
      }))
    },
  },
  {
    id: 'list-events',
    method: 'GET',
    path: '/events',
    title: 'List events',
    description:
      'Events from the calendars that are shown, merged and sorted by time. With no arguments: today and the next 6 days. A date alone (YYYY-MM-DD) covers that whole day in this machine\'s time zone. "when" is already in local time; use it when speaking. An invitation held by two accounts appears once.',
    mutating: false,
    input: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD or ISO date-time; defaults to today. With no "to", a date covers just that day' },
        to: { type: 'string', description: 'YYYY-MM-DD (inclusive) or ISO date-time; defaults to 7 days after "from" when both are omitted' },
        calendars: { type: 'array', items: { type: 'string' }, description: 'Limit to these calendars (name or email); defaults to every shown one' },
      },
    },
    run: async ({ from, to, calendars }: { from?: string; to?: string; calendars?: string[] }) => {
      const { store, service } = getRuntime()
      const range = parseRange(from, to)
      const only = calendars?.length ? calendars.map((c) => service.resolveSource(c)) : undefined
      const { events, errors } = await service.events(range.from.toISOString(), range.to.toISOString(), only)
      const sources = new Map(store.sources().map((s) => [s.id, s]))
      const label = (id: string) => sources.get(id)?.label ?? id
      return {
        events: events.map((e) => ({
          id: e.id,
          title: e.title || '(no title)',
          when: whenText(e),
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          location: e.location,
          calendar: label(e.sourceId),
          account: service.accountEmail(sources.get(e.sourceId)?.accountId ?? ''),
          alsoIn: e.alsoIn.length ? e.alsoIn.map(label) : undefined,
          joinUrl: e.joinUrl,
        })),
        problems: errors.length ? errors.map((p) => `${p.email}: ${p.message}`) : undefined,
      }
    },
  },
  {
    id: 'create-event',
    method: 'POST',
    path: '/create-event',
    title: 'Create event',
    description: 'Adds an event to a calendar (the default one unless "calendar" names another). Timed events need start with a UTC offset; all-day events use date.',
    mutating: true,
    input: { type: 'object', properties: { ...EVENT_FIELDS, calendar: { type: 'string', description: 'Calendar name or email; defaults to the default calendar' } }, required: ['title'] },
    run: async (args: EventArgs & { calendar?: string }) => {
      const event = await getRuntime().service.createEvent(args)
      return { created: { id: event.id, title: event.title, when: whenText(event) } }
    },
  },
  {
    id: 'update-event',
    method: 'POST',
    path: '/update-event',
    title: 'Update event',
    description: 'Changes the title, time or place of one event, by the id list_events returned. A recurring event changes only that occurrence. To move a timed event give both start and end.',
    mutating: true,
    input: { type: 'object', properties: { id: { type: 'string', description: 'The event id from list_events' }, ...EVENT_FIELDS }, required: ['id'] },
    run: async ({ id, ...rest }: EventArgs & { id: string }) => {
      const event = await getRuntime().service.updateEvent(id, rest)
      return { updated: { id: event.id, title: event.title, when: whenText(event) } }
    },
  },
  {
    id: 'delete-event',
    method: 'POST',
    path: '/delete-event',
    title: 'Delete event',
    description: 'Deletes one event, by the id list_events returned. A recurring event loses only that occurrence.',
    mutating: true,
    input: { type: 'object', properties: { id: { type: 'string', description: 'The event id from list_events' } }, required: ['id'] },
    run: async ({ id }: { id: string }) => {
      await getRuntime().service.deleteEvent(id)
      return { deleted: id }
    },
  },
  {
    id: 'configure-calendar',
    method: 'POST',
    path: '/configure-calendar',
    title: 'Configure calendar',
    description: 'Shows or hides a calendar in the calendar window and in answers, changes its colour (hue 0-359), or makes it the default for new events. Only changes what Meridian shows, never Google.',
    mutating: false,
    input: {
      type: 'object',
      properties: {
        calendar: { type: 'string', description: 'Calendar name or email' },
        visible: { type: 'boolean' },
        hue: { type: 'number', description: '0-359 on the colour wheel' },
        default: { type: 'boolean', description: 'Make it the calendar new events go to' },
      },
      required: ['calendar'],
    },
    run: async ({ calendar, visible, hue, default: makeDefault }: { calendar: string; visible?: boolean; hue?: number; default?: boolean }) => {
      const { store, service } = getRuntime()
      const source = service.resolveSource(calendar)
      const updated = store.updateSource(source.id, { visible, hue, isDefault: makeDefault })
      return updated && { calendar: service.describe(updated), shown: updated.visible, hue: updated.hue, default: updated.isDefault }
    },
  },
]
