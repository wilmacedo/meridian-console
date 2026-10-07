import { describe, expect, it } from 'vitest'
import { GoogleCalendarApi, GoogleError, InvalidGrantError, normalizeEvent, type GoogleEvent } from './google-client.js'

type Call = { url: string; init?: RequestInit }

function fakeFetch(...answers: { status?: number; body?: unknown }[]) {
  const calls: Call[] = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const next = answers.shift() ?? { status: 500, body: {} }
    return new Response(next.status === 204 ? null : JSON.stringify(next.body ?? {}), { status: next.status ?? 200 })
  }) as typeof fetch
  return { impl, calls }
}

const api = (f: typeof fetch) => new GoogleCalendarApi({ clientId: 'id', clientSecret: 'secret', fetch: f })

describe('normalizeEvent', () => {
  it('turns a timed event into an ISO instant and keeps the useful links', () => {
    const raw: GoogleEvent = {
      id: 'e1',
      iCalUID: 'uid-1',
      summary: 'Standup',
      location: 'Room 3',
      htmlLink: 'https://calendar.google.com/e1',
      hangoutLink: 'https://meet.google.com/abc',
      start: { dateTime: '2026-10-08T09:30:00-03:00' },
      end: { dateTime: '2026-10-08T09:50:00-03:00' },
    }
    expect(normalizeEvent(raw, 's1')).toEqual({
      id: 's1.e1',
      sourceId: 's1',
      title: 'Standup',
      start: '2026-10-08T12:30:00.000Z',
      end: '2026-10-08T12:50:00.000Z',
      allDay: false,
      location: 'Room 3',
      joinUrl: 'https://meet.google.com/abc',
      openUrl: 'https://calendar.google.com/e1',
      uid: 'uid-1',
      alsoIn: [],
    })
  })

  it('keeps an all-day event as dates, with the end the day after', () => {
    const e = normalizeEvent({ id: 'h', summary: 'Home', start: { date: '2026-10-07' }, end: { date: '2026-10-08' } }, 's1')
    expect(e).toMatchObject({ allDay: true, start: '2026-10-07', end: '2026-10-08', title: 'Home', uid: 'h' })
  })

  it('reads the video entry point when there is no hangout link, and tolerates a missing title', () => {
    const e = normalizeEvent(
      { id: 'z', conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:1' }, { entryPointType: 'video', uri: 'https://zoom.us/j/1' }] }, start: { dateTime: '2026-10-08T10:00:00Z' }, end: { dateTime: '2026-10-08T11:00:00Z' } },
      's1',
    )
    expect(e?.joinUrl).toBe('https://zoom.us/j/1')
    expect(e?.title).toBe('')
  })

  it('drops cancelled events', () => {
    expect(normalizeEvent({ id: 'x', status: 'cancelled', start: { date: '2026-10-07' }, end: { date: '2026-10-08' } }, 's1')).toBeUndefined()
  })
})

describe('GoogleCalendarApi', () => {
  it('builds a consent URL that asks for offline access and forces the consent screen', () => {
    const url = new URL(api(fakeFetch().impl).authUrl('https://m.test/cb', 'st', 'me@x.com'))
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('state')).toBe('st')
    expect(url.searchParams.get('login_hint')).toBe('me@x.com')
    expect(url.searchParams.get('scope')).toContain('calendar.events')
  })

  it('exchanges a code for the refresh token', async () => {
    const f = fakeFetch({ body: { access_token: 'at', refresh_token: 'rt' } })
    expect(await api(f.impl).exchangeCode('code', 'https://m.test/cb')).toEqual({ accessToken: 'at', refreshToken: 'rt' })
    expect(String(f.calls[0]?.init?.body)).toContain('grant_type=authorization_code')
  })

  it('reports a revoked grant apart from other token failures', async () => {
    await expect(api(fakeFetch({ status: 400, body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } }).impl).refresh('rt')).rejects.toBeInstanceOf(InvalidGrantError)
    await expect(api(fakeFetch({ status: 500, body: {} }).impl).refresh('rt')).rejects.toSatisfy((e) => e instanceof GoogleError && !(e instanceof InvalidGrantError))
  })

  it('lists calendars with the owner label when there is one, across pages', async () => {
    const f = fakeFetch(
      { body: { items: [{ id: 'me@x.com', summary: 'me@x.com', accessRole: 'owner', primary: true }], nextPageToken: 'p2' } },
      { body: { items: [{ id: 'fam', summary: 'Familia', summaryOverride: 'Família', accessRole: 'reader' }] } },
    )
    expect(await api(f.impl).listCalendars('at')).toEqual([
      { googleId: 'me@x.com', label: 'me@x.com', accessRole: 'owner', primary: true },
      { googleId: 'fam', label: 'Família', accessRole: 'reader', primary: false },
    ])
    expect(f.calls[1]?.url).toContain('pageToken=p2')
  })

  it('asks for single occurrences and escapes the calendar id', async () => {
    const f = fakeFetch({ body: { items: [{ id: 'a' }] } })
    expect(await api(f.impl).listEvents('at', 'a#holiday@group.v.calendar.google.com', '2026-10-07T00:00:00Z', '2026-10-14T00:00:00Z')).toHaveLength(1)
    expect(f.calls[0]?.url).toContain('/calendars/a%23holiday%40group.v.calendar.google.com/events?')
    expect(f.calls[0]?.url).toContain('singleEvents=true')
    expect((f.calls[0]?.init?.headers as Record<string, string>).authorization).toBe('Bearer at')
  })

  it('surfaces Google messages and treats a 204 delete as success', async () => {
    await expect(api(fakeFetch({ status: 403, body: { error: { message: 'Forbidden for this calendar' } } }).impl).insertEvent('at', 'c', {})).rejects.toMatchObject({ status: 403, message: 'Forbidden for this calendar' })
    await expect(api(fakeFetch({ status: 204 }).impl).deleteEvent('at', 'c', 'e')).resolves.toBeUndefined()
  })
})
