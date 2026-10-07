import { randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { CalendarStore, type RemoteCalendar } from './calendar-store.js'

const key = randomBytes(32)
const make = () => {
  const db = new DatabaseSync(':memory:')
  return { db, store: new CalendarStore(db, key) }
}

const mine: RemoteCalendar[] = [
  { googleId: 'me@x.com', label: 'me@x.com', accessRole: 'owner', primary: true },
  { googleId: 'holidays', label: 'Holidays', accessRole: 'reader', primary: false },
  { googleId: 'family', label: 'Family', accessRole: 'owner', primary: false },
]

describe('CalendarStore accounts', () => {
  it('keeps the refresh token encrypted at rest and readable through the store', () => {
    const { db, store } = make()
    const account = store.saveAccount('Me@X.com', '1//secret')
    expect(account.email).toBe('me@x.com')
    expect(store.refreshToken(account.id)).toBe('1//secret')
    const raw = db.prepare('SELECT refresh_token_enc FROM calendar_accounts').get() as { refresh_token_enc: string }
    expect(raw.refresh_token_enc).not.toContain('secret')
  })

  it('reuses the row when the same email signs in again and clears the pending state', () => {
    const { store } = make()
    const first = store.saveAccount('me@x.com', 'one')
    store.setStatus(first.id, 'pending')
    const again = store.saveAccount('me@x.com', 'two')
    expect(again.id).toBe(first.id)
    expect(store.accounts()).toHaveLength(1)
    expect(store.account(first.id)?.status).toBe('ok')
    expect(store.refreshToken(first.id)).toBe('two')
  })
})

describe('CalendarStore sources', () => {
  it('shows writable calendars and hides read-only ones by default', () => {
    const { store } = make()
    const account = store.saveAccount('me@x.com', 't')
    store.syncSources(account.id, mine)
    const byLabel = Object.fromEntries(store.sources().map((s) => [s.label, s]))
    expect(byLabel['me@x.com']?.visible).toBe(true)
    expect(byLabel.Family?.visible).toBe(true)
    expect(byLabel.Holidays?.visible).toBe(false)
  })

  it('gives each calendar its own hue and keeps it across syncs', () => {
    const { store } = make()
    const account = store.saveAccount('me@x.com', 't')
    store.syncSources(account.id, mine)
    const hues = store.sources().map((s) => s.hue)
    expect(new Set(hues).size).toBe(3)
    store.syncSources(account.id, mine)
    expect(store.sources().map((s) => s.hue)).toEqual(hues)
  })

  it('keeps the owner choices on a re-sync and drops calendars Google no longer lists', () => {
    const { store } = make()
    const account = store.saveAccount('me@x.com', 't')
    store.syncSources(account.id, mine)
    const family = store.sources().find((s) => s.label === 'Family')!
    store.updateSource(family.id, { visible: false })
    store.syncSources(account.id, mine.slice(0, 2))
    expect(store.sources().map((s) => s.label)).toEqual(['me@x.com', 'Holidays'])
    store.syncSources(account.id, mine)
    expect(store.source(family.id)?.visible).toBe(true)
  })

  it('defaults to the primary writable calendar and moves the default only on request', () => {
    const { store } = make()
    const account = store.saveAccount('me@x.com', 't')
    store.syncSources(account.id, [mine[2]!, mine[0]!])
    expect(store.sources().find((s) => s.isDefault)?.label).toBe('me@x.com')
    const family = store.sources().find((s) => s.label === 'Family')!
    store.updateSource(family.id, { isDefault: true })
    expect(store.sources().filter((s) => s.isDefault).map((s) => s.label)).toEqual(['Family'])
  })

  it('removes an account with its calendars and picks a new default', () => {
    const { store } = make()
    const a = store.saveAccount('a@x.com', 't')
    const b = store.saveAccount('b@x.com', 't')
    store.syncSources(a.id, [{ googleId: 'a@x.com', label: 'a', accessRole: 'owner', primary: true }])
    store.syncSources(b.id, [{ googleId: 'b@x.com', label: 'b', accessRole: 'owner', primary: true }])
    store.removeAccount(a.id)
    expect(store.accounts().map((x) => x.id)).toEqual([b.id])
    expect(store.sources().map((s) => [s.label, s.isDefault])).toEqual([['b', true]])
  })

  it('wraps hue edits into the circle', () => {
    const { store } = make()
    const account = store.saveAccount('me@x.com', 't')
    store.syncSources(account.id, mine)
    const id = store.sources()[0]!.id
    expect(store.updateSource(id, { hue: 370 })?.hue).toBe(10)
    expect(store.updateSource(id, { hue: -20 })?.hue).toBe(340)
  })
})
