import type { DeviceStore } from '../store.js'

const DAY = 86_400_000
const DEVICE_TTL_MS = 90 * DAY
const RENEW_AFTER_MS = 30 * DAY
const WINDOW_MS = 60_000
const MAX_PEERS = 1024

// The extension generates this itself: 256 random bits, unpadded base64url.
const NEXT_TOKEN = /^[A-Za-z0-9_-]{43}$/
const PAIRING_SECRET = /^[A-Za-z0-9_-]{32,256}$/

export interface AuthorizeReply {
  status: number
  body: Record<string, unknown>
  retryAfter?: number
}

// Per peer address and minute. The server only sees the proxy's address behind a reverse proxy, so this is a
// ceiling on the whole exchange endpoint as much as on one client; the table is bounded so a flood of addresses
// cannot grow it.
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly limit = 60,
    private readonly now: () => number = Date.now,
  ) {}

  allow(peer: string): boolean {
    const now = this.now()
    if (this.hits.size >= MAX_PEERS) for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k)
    const key = this.hits.has(peer) || this.hits.size < MAX_PEERS ? peer : '*'
    const hit = this.hits.get(key)
    if (!hit || hit.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + WINDOW_MS })
      return true
    }
    hit.count += 1
    return hit.count <= this.limit
  }
}

const fail = (status: number): AuthorizeReply => ({ status, body: { error: status === 400 ? 'bad request' : 'unauthorized' } })

// POST /authorize: swaps a one-use pairing secret, or the current device token, for the credential the extension
// just generated. The secret arrives as a bearer token and is never logged or stored in the clear.
export function authorize(store: DeviceStore, limiter: RateLimiter, peer: string, authorization: string | undefined, body: unknown, now: () => number = Date.now): AuthorizeReply {
  if (!limiter.allow(peer)) return { status: 429, body: { error: 'rate limited' }, retryAfter: 60 }
  const bearer = /^Bearer (\S+)$/.exec(authorization ?? '')?.[1]
  const { action, next_token: next } = (typeof body === 'object' && body !== null ? body : {}) as { action?: unknown; next_token?: unknown }
  if (!bearer || (action !== 'pair' && action !== 'renew') || typeof next !== 'string' || !NEXT_TOKEN.test(next)) return fail(400)

  const expiresAt = now() + DEVICE_TTL_MS
  let deviceId: string
  if (action === 'pair') {
    if (!PAIRING_SECRET.test(bearer) || !store.consumePairingLink(bearer)) return fail(401)
    deviceId = store.addDevice('browser', 'browser', next, expiresAt).id
  } else {
    const device = store.rotateToken(bearer, next, expiresAt)
    if (!device) return fail(401)
    deviceId = device.id
  }
  return { status: 200, body: { device_id: deviceId, expires_at: new Date(expiresAt).toISOString(), renew_after: new Date(now() + RENEW_AFTER_MS).toISOString(), service_name: 'Meridian' } }
}
