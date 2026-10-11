import { createHash, randomBytes } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

export type DeviceKind = 'browser' | 'executor'

export interface Device {
  id: string
  kind: DeviceKind
  label: string
  createdAt: number
  lastSeen: number | null
  revokedAt: number | null
}

const PAIRING_TTL_MS = 5 * 60_000

// Only hashes of secrets are stored: a copy of the database cannot be used to pair, or to connect as a device.
export const sha256 = (secret: string): string => createHash('sha256').update(secret).digest('hex')

const asDevice = (r: Record<string, unknown>): Device => ({
  id: r.id as string,
  kind: r.kind as DeviceKind,
  label: r.label as string,
  createdAt: r.created_at as number,
  lastSeen: r.last_seen as number | null,
  revokedAt: r.revoked_at as number | null,
})

export class DeviceStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => number = Date.now,
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        token_hash TEXT,
        prev_token_hash TEXT,
        token_expires_at INTEGER,
        created_at INTEGER NOT NULL,
        last_seen INTEGER,
        revoked_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS device_pairing_links (
        hash TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS device_executor_keys (
        device_id TEXT PRIMARY KEY REFERENCES devices(id),
        public_key TEXT NOT NULL,
        approved_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS device_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS device_executor_keys_public_key ON device_executor_keys (public_key);
    `)
  }

  // The plaintext link is returned once and never kept.
  createPairingLink(): { link: string; expiresAt: number } {
    const link = randomBytes(24).toString('base64url')
    const expiresAt = this.now() + PAIRING_TTL_MS
    this.db.prepare('INSERT INTO device_pairing_links (hash, expires_at) VALUES (?, ?)').run(sha256(link), expiresAt)
    return { link, expiresAt }
  }

  // Single use: the first caller wins, an expired or unknown link never does.
  consumePairingLink(link: string): boolean {
    const now = this.now()
    const res = this.db
      .prepare('UPDATE device_pairing_links SET used_at = ? WHERE hash = ? AND used_at IS NULL AND expires_at > ?')
      .run(now, sha256(link), now)
    return res.changes === 1
  }

  addDevice(kind: DeviceKind, label: string, token: string, tokenExpiresAt: number | null): Device {
    const id = randomBytes(16).toString('hex')
    const createdAt = this.now()
    this.db
      .prepare('INSERT INTO devices (id, kind, label, token_hash, token_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, kind, label, sha256(token), tokenExpiresAt, createdAt)
    return { id, kind, label, createdAt, lastSeen: null, revokedAt: null }
  }

  // A revoked or expired token authenticates nobody.
  deviceByToken(token: string): Device | undefined {
    const row = this.db
      .prepare('SELECT * FROM devices WHERE token_hash = ? AND revoked_at IS NULL AND (token_expires_at IS NULL OR token_expires_at > ?)')
      .get(sha256(token), this.now())
    return row ? asDevice(row) : undefined
  }

  // Swaps the credential for the one the device chose. An exact retry of the same pair (the response was lost)
  // succeeds again; the old token can never rotate to a different replacement. Returns the device, or undefined.
  rotateToken(oldToken: string, nextToken: string, tokenExpiresAt: number): Device | undefined {
    const oldHash = sha256(oldToken)
    const nextHash = sha256(nextToken)
    const current = this.db.prepare('SELECT * FROM devices WHERE token_hash = ? AND revoked_at IS NULL AND (token_expires_at IS NULL OR token_expires_at > ?)').get(oldHash, this.now())
    if (current) {
      this.db.prepare('UPDATE devices SET prev_token_hash = ?, token_hash = ?, token_expires_at = ? WHERE id = ?').run(oldHash, nextHash, tokenExpiresAt, current.id)
      return asDevice(current)
    }
    const retried = this.db.prepare('SELECT * FROM devices WHERE prev_token_hash = ? AND token_hash = ? AND revoked_at IS NULL').get(oldHash, nextHash)
    return retried ? asDevice(retried) : undefined
  }

  tokenExpiry(id: string): number | undefined {
    return this.db.prepare('SELECT token_expires_at FROM devices WHERE id = ? AND revoked_at IS NULL').get(id)?.token_expires_at as number | undefined
  }

  // Whether the device may still hold a connection: not revoked, and its grant has not lapsed.
  active(id: string): boolean {
    const row = this.db.prepare('SELECT token_expires_at FROM devices WHERE id = ? AND revoked_at IS NULL').get(id)
    if (!row) return false
    const exp = row.token_expires_at as number | null
    return exp === null || exp > this.now()
  }

  devices(): Device[] {
    return this.db.prepare('SELECT * FROM devices WHERE revoked_at IS NULL ORDER BY created_at').all().map(asDevice)
  }

  touch(id: string): void {
    this.db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').run(this.now(), id)
  }

  revoke(id: string): boolean {
    const res = this.db.prepare('UPDATE devices SET revoked_at = ?, token_hash = NULL, prev_token_hash = NULL WHERE id = ? AND revoked_at IS NULL').run(this.now(), id)
    // An executor's public key stays on record: a revoked device that dials in again is refused, not enrolled anew.
    return res.changes === 1
  }

  // A new executor waits, with no power, until the owner approves it.
  addExecutor(label: string, publicKey: string): Device {
    const id = randomBytes(16).toString('hex')
    const createdAt = this.now()
    this.db.prepare("INSERT INTO devices (id, kind, label, created_at) VALUES (?, 'executor', ?, ?)").run(id, label, createdAt)
    this.db.prepare('INSERT INTO device_executor_keys (device_id, public_key, approved_at) VALUES (?, ?, NULL)').run(id, publicKey)
    return { id, kind: 'executor', label, createdAt, lastSeen: null, revokedAt: null }
  }

  executorByKey(publicKey: string): { device: Device; approvedAt: number | null } | undefined {
    const r = this.db
      .prepare('SELECT d.*, k.approved_at FROM device_executor_keys k JOIN devices d ON d.id = k.device_id WHERE k.public_key = ?')
      .get(publicKey)
    return r ? { device: asDevice(r), approvedAt: r.approved_at as number | null } : undefined
  }

  // A device that never got approved leaves nothing behind when it goes away.
  dropUnapproved(deviceId: string): void {
    const waiting = this.db.prepare('SELECT 1 FROM device_executor_keys WHERE device_id = ? AND approved_at IS NULL').get(deviceId)
    if (!waiting) return
    this.db.prepare('DELETE FROM device_executor_keys WHERE device_id = ?').run(deviceId)
    this.db.prepare('DELETE FROM devices WHERE id = ?').run(deviceId)
  }

  pendingExecutors(): Device[] {
    return this.db
      .prepare('SELECT d.* FROM device_executor_keys k JOIN devices d ON d.id = k.device_id WHERE k.approved_at IS NULL AND d.revoked_at IS NULL ORDER BY d.created_at')
      .all()
      .map(asDevice)
  }

  approveExecutorKey(deviceId: string): boolean {
    return this.db.prepare('UPDATE device_executor_keys SET approved_at = ? WHERE device_id = ? AND approved_at IS NULL').run(this.now(), deviceId).changes === 1
  }

  getState(key: string): string | undefined {
    return this.db.prepare('SELECT value FROM device_state WHERE key = ?').get(key)?.value as string | undefined
  }

  setState(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO device_state (key, value) VALUES (?, ?)').run(key, value)
  }
}
