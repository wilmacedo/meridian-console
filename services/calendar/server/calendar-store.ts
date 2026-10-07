import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { decrypt, encrypt } from './token-crypto.js'

export type AccountStatus = 'ok' | 'pending'

export interface Account {
  id: string
  email: string
  status: AccountStatus
  addedAt: string
}

export interface Source {
  id: string
  accountId: string
  googleId: string
  label: string
  accessRole: string
  hue: number
  visible: boolean
  isDefault: boolean
}

export interface RemoteCalendar {
  googleId: string
  label: string
  accessRole: string
  primary: boolean
}

export interface SourcePatch {
  visible?: boolean
  hue?: number
  isDefault?: boolean
}

export const isWritable = (accessRole: string): boolean => accessRole === 'owner' || accessRole === 'writer'

// Golden-angle steps keep neighbouring calendars apart on the hue circle; 235 is where the design's first one sits.
const hueFor = (index: number): number => Math.round((235 + index * 137.508) % 360)

const sourceId = (accountId: string, googleId: string): string => createHash('sha1').update(`${accountId}|${googleId}`).digest('hex').slice(0, 10)

type Row = Record<string, SQLOutputValue>

const toAccount = (r: Row): Account => ({ id: String(r.id), email: String(r.email), status: r.status === 'pending' ? 'pending' : 'ok', addedAt: String(r.added_at) })

const toSource = (r: Row): Source => ({
  id: String(r.id),
  accountId: String(r.account_id),
  googleId: String(r.google_id),
  label: String(r.label),
  accessRole: String(r.access_role),
  hue: Number(r.hue),
  visible: r.visible === 1,
  isDefault: r.is_default === 1,
})

export class CalendarStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly key: Buffer,
  ) {
    db.exec(`CREATE TABLE IF NOT EXISTS calendar_accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      refresh_token_enc TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ok',
      added_at TEXT NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS calendar_sources (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES calendar_accounts(id) ON DELETE CASCADE,
      google_id TEXT NOT NULL,
      label TEXT NOT NULL,
      access_role TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      hue INTEGER NOT NULL,
      visible INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0
    )`)
  }

  accounts(): Account[] {
    return (this.db.prepare('SELECT * FROM calendar_accounts ORDER BY added_at, rowid').all() as Row[]).map(toAccount)
  }

  account(id: string): Account | undefined {
    const row = this.db.prepare('SELECT * FROM calendar_accounts WHERE id = ?').get(id) as Row | undefined
    return row && toAccount(row)
  }

  // Signing the same email in again keeps its row, so the calendars' colours and choices survive.
  saveAccount(email: string, refreshToken: string): Account {
    const clean = email.trim().toLowerCase()
    const sealed = encrypt(this.key, refreshToken)
    const existing = this.db.prepare('SELECT * FROM calendar_accounts WHERE email = ?').get(clean) as Row | undefined
    if (existing) {
      this.db.prepare("UPDATE calendar_accounts SET refresh_token_enc = ?, status = 'ok' WHERE id = ?").run(sealed, String(existing.id))
      return { ...toAccount(existing), status: 'ok' }
    }
    const account: Account = { id: randomUUID().slice(0, 8), email: clean, status: 'ok', addedAt: new Date().toISOString() }
    this.db.prepare('INSERT INTO calendar_accounts (id, email, refresh_token_enc, status, added_at) VALUES (?, ?, ?, ?, ?)').run(account.id, account.email, sealed, account.status, account.addedAt)
    return account
  }

  refreshToken(accountId: string): string | undefined {
    const row = this.db.prepare('SELECT refresh_token_enc FROM calendar_accounts WHERE id = ?').get(accountId) as Row | undefined
    return row && decrypt(this.key, String(row.refresh_token_enc))
  }

  setStatus(accountId: string, status: AccountStatus): void {
    this.db.prepare('UPDATE calendar_accounts SET status = ? WHERE id = ?').run(status, accountId)
  }

  removeAccount(accountId: string): void {
    this.db.prepare('DELETE FROM calendar_sources WHERE account_id = ?').run(accountId)
    this.db.prepare('DELETE FROM calendar_accounts WHERE id = ?').run(accountId)
    this.ensureDefault()
  }

  sources(): Source[] {
    const rows = this.db.prepare('SELECT s.* FROM calendar_sources s JOIN calendar_accounts a ON a.id = s.account_id ORDER BY a.added_at, a.rowid, s.rowid').all() as Row[]
    return rows.map(toSource)
  }

  source(id: string): Source | undefined {
    const row = this.db.prepare('SELECT * FROM calendar_sources WHERE id = ?').get(id) as Row | undefined
    return row && toSource(row)
  }

  // New calendars start visible only when the owner can write to them: shared holiday and birthday calendars
  // would otherwise bury their own events.
  syncSources(accountId: string, remote: RemoteCalendar[]): void {
    const known = new Map(this.sources().filter((s) => s.accountId === accountId).map((s) => [s.googleId, s]))
    const seen = new Set<string>()
    let total = this.sources().length

    for (const cal of remote) {
      seen.add(cal.googleId)
      const current = known.get(cal.googleId)
      if (current) {
        this.db.prepare('UPDATE calendar_sources SET label = ?, access_role = ?, is_primary = ? WHERE id = ?').run(cal.label, cal.accessRole, cal.primary ? 1 : 0, current.id)
        continue
      }
      this.db
        .prepare('INSERT INTO calendar_sources (id, account_id, google_id, label, access_role, is_primary, hue, visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(sourceId(accountId, cal.googleId), accountId, cal.googleId, cal.label, cal.accessRole, cal.primary ? 1 : 0, hueFor(total), isWritable(cal.accessRole) ? 1 : 0)
      total += 1
    }

    for (const [googleId, source] of known) {
      if (!seen.has(googleId)) this.db.prepare('DELETE FROM calendar_sources WHERE id = ?').run(source.id)
    }
    this.ensureDefault()
  }

  updateSource(id: string, patch: SourcePatch): Source | undefined {
    if (!this.source(id)) return undefined
    if (patch.visible !== undefined) this.db.prepare('UPDATE calendar_sources SET visible = ? WHERE id = ?').run(patch.visible ? 1 : 0, id)
    if (patch.hue !== undefined) this.db.prepare('UPDATE calendar_sources SET hue = ? WHERE id = ?').run(Math.round(((patch.hue % 360) + 360) % 360), id)
    if (patch.isDefault) {
      this.db.exec('UPDATE calendar_sources SET is_default = 0')
      this.db.prepare('UPDATE calendar_sources SET is_default = 1 WHERE id = ?').run(id)
    }
    return this.source(id)
  }

  private ensureDefault(): void {
    if (this.db.prepare('SELECT 1 FROM calendar_sources WHERE is_default = 1').get()) return
    const pick = this.db
      .prepare(
        `SELECT s.id FROM calendar_sources s JOIN calendar_accounts a ON a.id = s.account_id
         WHERE s.access_role IN ('owner', 'writer') ORDER BY s.is_primary DESC, a.added_at, a.rowid, s.rowid LIMIT 1`,
      )
      .get() as Row | undefined
    if (pick) this.db.prepare('UPDATE calendar_sources SET is_default = 1 WHERE id = ?').run(String(pick.id))
  }
}
