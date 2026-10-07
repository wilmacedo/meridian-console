import { isWritable, type Account, type CalendarStore, type Source } from './calendar-store.js'
import { buildEventBody, type EventInput } from './event-input.js'
import { GoogleError, InvalidGrantError, normalizeEvent, type CalendarEvent, type GoogleCalendarApi } from './google-client.js'

export type Log = (level: 'info' | 'warn' | 'error', message: string) => void

export interface AccountProblem {
  accountId: string
  email: string
  message: string
}

export interface EventsResult {
  events: CalendarEvent[]
  errors: AccountProblem[]
}

const CACHE_MS = 60_000
// Access tokens last an hour; renewing a little early avoids a request that dies on the way.
const TOKEN_SLACK_MS = 60_000

export class CalendarService {
  private readonly tokens = new Map<string, { token: string; expires: number }>()
  private readonly cache = new Map<string, { at: number; events: CalendarEvent[] }>()

  constructor(
    private readonly store: CalendarStore,
    private readonly google: GoogleCalendarApi,
    private readonly log: Log,
    private readonly now: () => number = Date.now,
  ) {}

  // Finishes a sign-in: the account is named by its primary calendar, so no extra scope is needed to read the email.
  async connect(code: string, redirectUri: string): Promise<Account> {
    const { accessToken, refreshToken } = await this.google.exchangeCode(code, redirectUri)
    if (!refreshToken) throw new Error('Google sent no refresh token; remove Meridian at myaccount.google.com/permissions and sign in again')
    const calendars = await this.google.listCalendars(accessToken)
    const email = calendars.find((c) => c.primary)?.googleId
    if (!email) throw new Error('Google listed no primary calendar for this account')

    const account = this.store.saveAccount(email, refreshToken)
    this.store.syncSources(account.id, calendars)
    this.tokens.set(account.id, { token: accessToken, expires: this.now() + 3_300_000 })
    this.cache.clear()
    this.log('info', `${account.email} connected, ${calendars.length} calendars`)
    return account
  }

  async disconnect(accountId: string): Promise<boolean> {
    const account = this.store.account(accountId)
    if (!account) return false
    const refreshToken = this.store.refreshToken(accountId)
    if (refreshToken) await this.google.revoke(refreshToken)
    this.store.removeAccount(accountId)
    this.tokens.delete(accountId)
    this.cache.clear()
    this.log('info', `${account.email} disconnected`)
    return true
  }

  async events(fromIso: string, toIso: string, only?: Source[]): Promise<EventsResult> {
    const sources = (only ?? this.store.sources().filter((s) => s.visible))
    const accounts = new Map(this.store.accounts().map((a) => [a.id, a]))
    const errors = new Map<string, AccountProblem>()
    const problem = (account: Account, message: string) => errors.set(account.id, { accountId: account.id, email: account.email, message })

    const perSource = await Promise.all(
      sources.map(async (source): Promise<CalendarEvent[]> => {
        const account = accounts.get(source.accountId)
        if (!account) return []
        if (account.status === 'pending') {
          problem(account, 'needs to sign in again')
          return []
        }
        const key = `${source.id}|${fromIso}|${toIso}`
        const hit = this.cache.get(key)
        if (hit && this.now() - hit.at < CACHE_MS) return hit.events
        try {
          const raw = await this.withToken(account, (token) => this.google.listEvents(token, source.googleId, fromIso, toIso))
          const events = raw.flatMap((r) => normalizeEvent(r, source.id) ?? [])
          this.cache.set(key, { at: this.now(), events })
          return events
        } catch (err) {
          problem(account, err instanceof InvalidGrantError ? 'needs to sign in again' : err instanceof Error ? err.message : String(err))
          return []
        }
      }),
    )

    return { events: dedupe(perSource.flat()), errors: [...errors.values()] }
  }

  async createEvent(input: EventInput & { calendar?: string }): Promise<CalendarEvent> {
    const source = this.writableSource(input.calendar)
    const body = buildEventBody(input, 'create')
    const raw = await this.write(source, (token) => this.google.insertEvent(token, source.googleId, body))
    this.log('info', `created "${input.title}" in ${source.label}`)
    return this.written(raw, source)
  }

  async updateEvent(id: string, input: EventInput): Promise<CalendarEvent> {
    const { source, eventId } = this.locate(id)
    const body = buildEventBody(input, 'patch')
    const raw = await this.write(source, (token) => this.google.patchEvent(token, source.googleId, eventId, body))
    this.log('info', `updated "${raw.summary ?? eventId}" in ${source.label}`)
    return this.written(raw, source)
  }

  async deleteEvent(id: string): Promise<void> {
    const { source, eventId } = this.locate(id)
    await this.write(source, (token) => this.google.deleteEvent(token, source.googleId, eventId))
    this.log('info', `deleted an event from ${source.label}`)
  }

  // Finds a calendar by id, by its name, or by its account's email when that account has only one writable one.
  resolveSource(ref: string): Source {
    const all = this.store.sources()
    const needle = ref.trim().toLowerCase()
    const byId = all.find((s) => s.id === ref)
    if (byId) return byId
    const named = all.filter((s) => s.label.toLowerCase() === needle || s.googleId.toLowerCase() === needle)
    if (named.length === 1) return named[0]!
    if (named.length > 1) throw new Error(`"${ref}" matches ${named.length} calendars (${named.map((s) => this.describe(s)).join(', ')}); name the account too`)
    const emailMatches = all.filter((s) => this.accountEmail(s.accountId) === needle && isWritable(s.accessRole))
    if (emailMatches.length === 1) return emailMatches[0]!
    throw new Error(`no calendar named "${ref}"; list_calendars shows what is connected`)
  }

  describe(source: Source): string {
    return `${source.label} (${this.accountEmail(source.accountId)})`
  }

  accountEmail(accountId: string): string {
    return this.store.account(accountId)?.email ?? ''
  }

  private writableSource(ref: string | undefined): Source {
    const source = ref ? this.resolveSource(ref) : this.store.sources().find((s) => s.isDefault)
    if (!source) throw new Error('no calendar is connected yet; the owner has to connect one in the calendar window')
    if (!isWritable(source.accessRole)) throw new Error(`${this.describe(source)} is read-only`)
    return source
  }

  private locate(id: string): { source: Source; eventId: string } {
    const dot = id.indexOf('.')
    const source = dot > 0 ? this.store.source(id.slice(0, dot)) : undefined
    if (!source) throw new Error(`unknown event id "${id}"; take it from list_events`)
    if (!isWritable(source.accessRole)) throw new Error(`${this.describe(source)} is read-only`)
    return { source, eventId: id.slice(dot + 1) }
  }

  private written(raw: Parameters<typeof normalizeEvent>[0], source: Source): CalendarEvent {
    const event = normalizeEvent(raw, source.id)
    if (!event) throw new Error('Google returned an event that could not be read')
    return event
  }

  private async write<T>(source: Source, run: (token: string) => Promise<T>): Promise<T> {
    const account = this.store.account(source.accountId)
    if (!account) throw new Error('that calendar belongs to an account that is no longer connected')
    if (account.status === 'pending') throw new Error(`${account.email} needs to sign in again`)
    try {
      return await this.withToken(account, run)
    } finally {
      this.cache.clear()
      this.store.bump()
    }
  }

  // A token that Google refuses mid-hour is renewed once; a refused refresh token means the account needs the owner.
  private async withToken<T>(account: Account, run: (token: string) => Promise<T>): Promise<T> {
    try {
      try {
        return await run(await this.accessToken(account))
      } catch (err) {
        if (!(err instanceof GoogleError) || err.status !== 401 || err instanceof InvalidGrantError) throw err
        this.tokens.delete(account.id)
        return await run(await this.accessToken(account))
      }
    } catch (err) {
      if (err instanceof InvalidGrantError) this.markPending(account)
      throw err
    }
  }

  private async accessToken(account: Account): Promise<string> {
    const cached = this.tokens.get(account.id)
    if (cached && cached.expires - TOKEN_SLACK_MS > this.now()) return cached.token
    const refreshToken = this.store.refreshToken(account.id)
    if (!refreshToken) throw new InvalidGrantError('no refresh token stored', 400)
    const { accessToken, expiresInSec } = await this.google.refresh(refreshToken)
    this.tokens.set(account.id, { token: accessToken, expires: this.now() + expiresInSec * 1000 })
    return accessToken
  }

  private markPending(account: Account): void {
    this.tokens.delete(account.id)
    if (this.store.account(account.id)?.status === 'pending') return
    this.store.setStatus(account.id, 'pending')
    this.log('error', `${account.email} needs to sign in again`)
  }
}

// The same invitation sits in every attendee's calendar. It is shown once, by the first calendar in connection
// order, and remembers the others.
export function dedupe(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Map<string, CalendarEvent>()
  for (const e of events) {
    const key = `${e.uid}|${e.start}`
    const first = seen.get(key)
    if (first) first.alsoIn.push(e.sourceId)
    else seen.set(key, { ...e, alsoIn: [] })
  }
  return [...seen.values()].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
}
