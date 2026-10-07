import type { RemoteCalendar } from './calendar-store.js'

export const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly']

const API = 'https://www.googleapis.com/calendar/v3'
const MAX_PAGES = 10

export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

// The refresh token was revoked or expired: the owner has to sign this account in again.
export class InvalidGrantError extends GoogleError {}

export interface GoogleEvent {
  id: string
  iCalUID?: string
  status?: string
  summary?: string
  location?: string
  htmlLink?: string
  hangoutLink?: string
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] }
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

export interface CalendarEvent {
  // `<source id>.<google event id>`, so a write knows which calendar to talk to.
  id: string
  sourceId: string
  title: string
  // An ISO instant, or `YYYY-MM-DD` for an all-day event (whose `end` is the day after the last one).
  start: string
  end: string
  allDay: boolean
  location?: string
  joinUrl?: string
  openUrl?: string
  uid: string
  // Other visible calendars holding the same invitation.
  alsoIn: string[]
}

export interface EventBody {
  summary?: string
  location?: string
  start?: { date?: string | null; dateTime?: string | null }
  end?: { date?: string | null; dateTime?: string | null }
}

type FetchLike = typeof fetch

export interface GoogleConfig {
  clientId: string
  clientSecret: string
  fetch?: FetchLike
}

interface ErrorBody {
  error?: string | { message?: string }
  error_description?: string
}

export function normalizeEvent(raw: GoogleEvent, sourceId: string): CalendarEvent | undefined {
  if (raw.status === 'cancelled' || !raw.start || !raw.end) return undefined
  const allDay = raw.start.date !== undefined
  const start = allDay ? raw.start.date : raw.start.dateTime && new Date(raw.start.dateTime).toISOString()
  const end = allDay ? raw.end.date : raw.end.dateTime && new Date(raw.end.dateTime).toISOString()
  if (!start || !end) return undefined

  return {
    id: `${sourceId}.${raw.id}`,
    sourceId,
    title: raw.summary ?? '',
    start,
    end,
    allDay,
    location: raw.location || undefined,
    joinUrl: raw.hangoutLink ?? raw.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri,
    openUrl: raw.htmlLink,
    uid: raw.iCalUID ?? raw.id,
    alsoIn: [],
  }
}

export class GoogleCalendarApi {
  private readonly http: FetchLike

  constructor(private readonly cfg: GoogleConfig) {
    this.http = cfg.fetch ?? fetch
  }

  authUrl(redirectUri: string, state: string, loginHint?: string): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.search = new URLSearchParams({
      client_id: this.cfg.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
      ...(loginHint ? { login_hint: loginHint } : {}),
    }).toString()
    return url.toString()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken?: string }> {
    const body = await this.token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
    return { accessToken: String(body.access_token), refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined }
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; expiresInSec: number }> {
    const body = await this.token({ grant_type: 'refresh_token', refresh_token: refreshToken })
    return { accessToken: String(body.access_token), expiresInSec: Number(body.expires_in ?? 3600) }
  }

  async revoke(token: string): Promise<void> {
    await this.http('https://oauth2.googleapis.com/revoke', { method: 'POST', body: new URLSearchParams({ token }) }).catch(() => undefined)
  }

  async listCalendars(accessToken: string): Promise<RemoteCalendar[]> {
    const out: RemoteCalendar[] = []
    let pageToken: string | undefined
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const body = (await this.api(accessToken, `/users/me/calendarList?${new URLSearchParams({ maxResults: '250', ...(pageToken ? { pageToken } : {}) })}`)) as {
        items?: { id: string; summary?: string; summaryOverride?: string; accessRole: string; primary?: boolean }[]
        nextPageToken?: string
      }
      for (const c of body.items ?? []) out.push({ googleId: c.id, label: c.summaryOverride ?? c.summary ?? c.id, accessRole: c.accessRole, primary: c.primary === true })
      pageToken = body.nextPageToken
      if (!pageToken) break
    }
    return out
  }

  async listEvents(accessToken: string, calendarId: string, fromIso: string, toIso: string): Promise<GoogleEvent[]> {
    const out: GoogleEvent[] = []
    let pageToken: string | undefined
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ timeMin: fromIso, timeMax: toIso, singleEvents: 'true', orderBy: 'startTime', maxResults: '250', ...(pageToken ? { pageToken } : {}) })
      const body = (await this.api(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events?${query}`)) as { items?: GoogleEvent[]; nextPageToken?: string }
      out.push(...(body.items ?? []))
      pageToken = body.nextPageToken
      if (!pageToken) break
    }
    return out
  }

  async insertEvent(accessToken: string, calendarId: string, body: EventBody): Promise<GoogleEvent> {
    return (await this.api(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', body })) as GoogleEvent
  }

  async patchEvent(accessToken: string, calendarId: string, eventId: string, body: EventBody): Promise<GoogleEvent> {
    return (await this.api(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', body })) as GoogleEvent
  }

  async deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
    await this.api(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' })
  }

  private async token(params: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await this.http('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, ...params }),
    })
    const body = (await res.json().catch(() => ({}))) as ErrorBody & Record<string, unknown>
    if (res.ok) return body
    const message = body.error_description ?? (typeof body.error === 'string' ? body.error : `token endpoint answered ${res.status}`)
    if (body.error === 'invalid_grant') throw new InvalidGrantError(message, res.status)
    throw new GoogleError(message, res.status)
  }

  private async api(accessToken: string, path: string, init: { method?: string; body?: EventBody } = {}): Promise<unknown> {
    const res = await this.http(`${API}${path}`, {
      method: init.method ?? 'GET',
      headers: { authorization: `Bearer ${accessToken}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
    if (res.status === 204) return undefined
    const body = (await res.json().catch(() => ({}))) as ErrorBody
    if (res.ok) return body
    throw new GoogleError(typeof body.error === 'object' ? (body.error?.message ?? `Google answered ${res.status}`) : `Google answered ${res.status}`, res.status)
  }
}
