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

export interface ExecutorKey {
  deviceId: string
  publicKey: string
  // Null until the owner approves the device on screen.
  approvedAt: number | null
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
    const id = randomBytes(8).toString('hex')
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

  devices(): Device[] {
    return this.db.prepare('SELECT * FROM devices WHERE revoked_at IS NULL ORDER BY created_at').all().map(asDevice)
  }

  touch(id: string): void {
    this.db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').run(this.now(), id)
  }

  revoke(id: string): boolean {
    const res = this.db.prepare('UPDATE devices SET revoked_at = ?, token_hash = NULL WHERE id = ? AND revoked_at IS NULL').run(this.now(), id)
    this.db.prepare('DELETE FROM device_executor_keys WHERE device_id = ?').run(id)
    return res.changes === 1
  }

  addExecutorKey(deviceId: string, publicKey: string): void {
    this.db.prepare('INSERT OR REPLACE INTO device_executor_keys (device_id, public_key, approved_at) VALUES (?, ?, NULL)').run(deviceId, publicKey)
  }

  approveExecutorKey(deviceId: string): boolean {
    return this.db.prepare('UPDATE device_executor_keys SET approved_at = ? WHERE device_id = ? AND approved_at IS NULL').run(this.now(), deviceId).changes === 1
  }

  executorKey(deviceId: string): ExecutorKey | undefined {
    const r = this.db.prepare('SELECT * FROM device_executor_keys WHERE device_id = ?').get(deviceId)
    return r ? { deviceId, publicKey: r.public_key as string, approvedAt: r.approved_at as number | null } : undefined
  }

  getState(key: string): string | undefined {
    return this.db.prepare('SELECT value FROM device_state WHERE key = ?').get(key)?.value as string | undefined
  }

  setState(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO device_state (key, value) VALUES (?, ?)').run(key, value)
  }
}
