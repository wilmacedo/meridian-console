import { randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { CalendarService, dedupe, type Log } from './calendar-service.js'
import { CalendarStore } from './calendar-store.js'
import { GoogleCalendarApi, type CalendarEvent } from './google-client.js'

type Handler = (url: URL, init: RequestInit) => { status?: number; body?: unknown } | undefined

function setup(handler: Handler) {
  const calls: string[] = []
  const clock = { t: 1_000_000 }
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input))
    calls.push(`${init.method ?? 'GET'} ${url.pathname}`)
    const answer = handler(url, init) ?? { status: 404, body: {} }
    return new Response(answer.status === 204 ? null : JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200 })
  }) as typeof fetch
  const store = new CalendarStore(new DatabaseSync(':memory:'), randomBytes(32))
  const logs: string[] = []
  const log: Log = (level, message) => logs.push(`${level}: ${message}`)
  const service = new CalendarService(store, new GoogleCalendarApi({ clientId: 'id', clientSecret: 's', fetch: fetchImpl }), log, () => clock.t)
  return { service, store, calls, logs, clock }
}

const token = (url: URL) => (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token' ? { body: { access_token: 'at', expires_in: 3600 } } : undefined)

const event = (id: string, summary: string, hour: number, uid = id) => ({
  id,
  iCalUID: uid,
  summary,
  start: { dateTime: `2026-10-08T${String(hour).padStart(2, '0')}:00:00Z` },
  end: { dateTime: `2026-10-08T${String(hour + 1).padStart(2, '0')}:00:00Z` },
})

function connected(store: CalendarStore, email = 'me@x.com', role = 'owner') {
  const account = store.saveAccount(email, 'rt')
  store.syncSources(account.id, [{ googleId: email, label: email, accessRole: role, primary: true }])
  return account
}

const RANGE = ['2026-10-08T00:00:00Z', '2026-10-09T00:00:00Z'] as const

describe('CalendarService.events', () => {
  it('merges the visible calendars, sorted, and uses the cache inside a minute', async () => {
    const { service, store, calls, clock } = setup((url) => token(url) ?? (url.pathname.endsWith('/events') ? { body: { items: [event('b', 'Later', 15), event('a', 'Sooner', 9)] } } : undefined))
    connected(store)
    const first = await service.events(...RANGE)
    expect(first.events.map((e) => e.title)).toEqual(['Sooner', 'Later'])
    await service.events(...RANGE)
    expect(calls.filter((c) => c.endsWith('/events'))).toHaveLength(1)
    clock.t += 61_000
    await service.events(...RANGE)
    expect(calls.filter((c) => c.endsWith('/events'))).toHaveLength(2)
  })

  it('skips hidden calendars', async () => {
    const { service, store, calls } = setup((url) => token(url) ?? { body: { items: [event('a', 'A', 9)] } })
    const account = connected(store)
    store.updateSource(store.sources().find((s) => s.accountId === account.id)!.id, { visible: false })
    expect((await service.events(...RANGE)).events).toEqual([])
    expect(calls).toEqual([])
  })

  it('keeps answering for one account when another is revoked, and marks it pending once', async () => {
    const { service, store, logs } = setup((url) => {
      if (url.pathname === '/token') return { status: 400, body: { error: 'invalid_grant' } }
      return undefined
    })
    connected(store, 'old@x.com')
    const result = await service.events(...RANGE)
    expect(result.errors).toEqual([{ accountId: store.accounts()[0]!.id, email: 'old@x.com', message: 'needs to sign in again' }])
    expect(store.accounts()[0]!.status).toBe('pending')
    await service.events(...RANGE)
    expect(logs.filter((l) => l.startsWith('error'))).toHaveLength(1)
  })

  it('reports a failing account without losing the working one', async () => {
    const { service, store } = setup((url) => {
      if (url.pathname === '/token') return { body: { access_token: 'at', expires_in: 3600 } }
      if (url.pathname.includes('bad%40x.com')) return { status: 500, body: { error: { message: 'backend error' } } }
      return { body: { items: [event('a', 'Fine', 9)] } }
    })
    connected(store, 'good@x.com')
    connected(store, 'bad@x.com')
    const { events, errors } = await service.events(...RANGE)
    expect(events.map((e) => e.title)).toEqual(['Fine'])
    expect(errors).toMatchObject([{ email: 'bad@x.com', message: 'backend error' }])
  })

  it('renews a token Google refuses once, then gives up', async () => {
    let tokens = 0
    let attempts = 0
    const { service, store } = setup((url) => {
      if (url.pathname === '/token') {
        tokens += 1
        return { body: { access_token: `at${tokens}`, expires_in: 3600 } }
      }
      attempts += 1
      return attempts === 1 ? { status: 401, body: { error: { message: 'Invalid Credentials' } } } : { body: { items: [event('a', 'Back', 9)] } }
    })
    connected(store)
    expect((await service.events(...RANGE)).events.map((e) => e.title)).toEqual(['Back'])
    expect(tokens).toBe(2)
  })
})

describe('dedupe', () => {
  const make = (id: string, sourceId: string, uid: string, start = '2026-10-08T12:00:00.000Z'): CalendarEvent => ({ id, sourceId, title: id, start, end: start, allDay: false, uid, alsoIn: [] })

  it('shows an invitation once, owned by the first calendar, and notes the others', () => {
    const merged = dedupe([make('a', 's1', 'u1'), make('b', 's2', 'u1'), make('c', 's2', 'u2')])
    expect(merged.map((e) => [e.id, e.alsoIn])).toEqual([['a', ['s2']], ['c', []]])
  })

  it('treats occurrences of one recurring event as different events', () => {
    expect(dedupe([make('a', 's1', 'u1', '2026-10-08T12:00:00.000Z'), make('b', 's1', 'u1', '2026-10-09T12:00:00.000Z')])).toHaveLength(2)
  })

  it('does not change the events it was given', () => {
    const input = [make('a', 's1', 'u1'), make('b', 's2', 'u1')]
    dedupe(input)
    expect(input[0]!.alsoIn).toEqual([])
  })
})

describe('CalendarService writes', () => {
  it('creates in the default calendar and clears the cache', async () => {
    let created: unknown
    const { service, store, calls } = setup((url, init) => {
      const t = token(url)
      if (t) return t
      if (init.method === 'POST') {
        created = JSON.parse(String(init.body))
        return { body: { id: 'new1', summary: 'Dentist', start: { dateTime: '2026-10-09T13:00:00Z' }, end: { dateTime: '2026-10-09T14:00:00Z' } } }
      }
      return { body: { items: [] } }
    })
    connected(store)
    await service.events(...RANGE)
    const made = await service.createEvent({ title: 'Dentist', start: '2026-10-09T10:00:00-03:00' })
    expect(created).toMatchObject({ summary: 'Dentist', start: { dateTime: '2026-10-09T13:00:00.000Z' } })
    expect(made.id).toBe(`${store.sources()[0]!.id}.new1`)
    await service.events(...RANGE)
    expect(calls.filter((c) => c.endsWith('/events') && c.startsWith('GET'))).toHaveLength(2)
  })

  it('refuses to write to a read-only calendar, and to an unknown one', async () => {
    const { service, store } = setup((url) => token(url))
    connected(store, 'me@x.com')
    connected(store, 'ro@x.com', 'reader')
    await expect(service.createEvent({ title: 'x', start: '2026-10-09T10:00:00Z', calendar: 'ro@x.com' })).rejects.toThrow(/read-only/)
    await expect(service.createEvent({ title: 'x', start: '2026-10-09T10:00:00Z', calendar: 'nope' })).rejects.toThrow(/no calendar named/)
  })

  it('asks which account when two calendars share a name', async () => {
    const { service, store } = setup((url) => token(url))
    for (const email of ['a@x.com', 'b@x.com']) {
      const account = store.saveAccount(email, 'rt')
      store.syncSources(account.id, [{ googleId: email, label: email, accessRole: 'owner', primary: true }, { googleId: `fam-${email}`, label: 'Family', accessRole: 'owner', primary: false }])
    }
    await expect(service.createEvent({ title: 'x', start: '2026-10-09T10:00:00Z', calendar: 'family' })).rejects.toThrow(/matches 2 calendars/)
  })

  it('deletes by the id list_events gave, and refuses an unknown id', async () => {
    const { service, store, calls } = setup((url, init) => token(url) ?? (init.method === 'DELETE' ? { status: 204 } : undefined))
    connected(store)
    const sourceId = store.sources()[0]!.id
    await service.deleteEvent(`${sourceId}.abc_20261008T120000Z`)
    expect(calls.at(-1)).toMatch(/^DELETE .*events\/abc_20261008T120000Z$/)
    await expect(service.deleteEvent('zzz.abc')).rejects.toThrow(/unknown event id/)
  })

  it('does not write to an account that needs to sign in again', async () => {
    const { service, store } = setup((url) => token(url))
    const account = connected(store)
    store.setStatus(account.id, 'pending')
    await expect(service.createEvent({ title: 'x', start: '2026-10-09T10:00:00Z' })).rejects.toThrow(/sign in again/)
  })
})

describe('CalendarService.connect', () => {
  it('names the account by its primary calendar and syncs its calendars', async () => {
    const { service, store, logs } = setup((url) => {
      if (url.pathname === '/token') return { body: { access_token: 'at', refresh_token: 'rt' } }
      if (url.pathname.endsWith('/calendarList')) return { body: { items: [{ id: 'me@x.com', summary: 'me@x.com', accessRole: 'owner', primary: true }, { id: 'h', summary: 'Holidays', accessRole: 'reader' }] } }
      return undefined
    })
    const account = await service.connect('code', 'https://m.test/cb')
    expect(account.email).toBe('me@x.com')
    expect(store.sources().map((s) => [s.label, s.visible])).toEqual([['me@x.com', true], ['Holidays', false]])
    expect(store.refreshToken(account.id)).toBe('rt')
    expect(logs).toEqual(['info: me@x.com connected, 2 calendars'])
  })

  it('explains a sign-in that came without a refresh token', async () => {
    const { service } = setup((url) => (url.pathname === '/token' ? { body: { access_token: 'at' } } : undefined))
    await expect(service.connect('code', 'https://m.test/cb')).rejects.toThrow(/no refresh token/)
  })

  it('removes an account and everything it owned', async () => {
    const { service, store } = setup((url) => (url.pathname === '/revoke' ? { body: {} } : undefined))
    const account = connected(store)
    expect(await service.disconnect(account.id)).toBe(true)
    expect(store.accounts()).toEqual([])
    expect(store.sources()).toEqual([])
    expect(await service.disconnect(account.id)).toBe(false)
  })
})
