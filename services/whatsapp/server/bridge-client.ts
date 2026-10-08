export type BridgeState = 'connecting' | 'pairing' | 'connected'

export interface BridgeStatus {
  state: BridgeState
  qr: string
  phone: string
}

export interface BridgeChat {
  jid: string
  name: string
  isGroup: boolean
  lastTs: number
  preview: string
  lastFromMe: boolean
}

export interface BridgeMessage {
  id: string
  chat: string
  chatName: string
  sender: string
  senderName: string
  fromMe: boolean
  ts: number
  text: string
  mediaType?: string
  filename?: string
  replyTo?: string
}

export interface BridgeContact {
  jid: string
  name: string
  isGroup: boolean
}

export interface MessageFilter {
  chat?: string
  q?: string
  before?: number
  after?: number
  limit?: number
}

export interface SendBody {
  chat: string
  text?: string
  path?: string
  voice?: boolean
  replyTo?: string
}

export interface BackfillResult {
  added: number
  oldest: number
  reachedStart: boolean
  stopped: string
}

type Fetch = typeof fetch

// Thin typed wrapper over the bridge's loopback API. It carries no policy: what may be sent, and when, is decided
// by the actions that call it.
export class BridgeClient {
  constructor(
    private readonly origin: string,
    private readonly token: string,
    private readonly doFetch: Fetch = fetch,
  ) {}

  private async call<T>(method: 'GET' | 'POST', path: string, query?: Record<string, string | number | undefined>, body?: unknown): Promise<T> {
    const url = new URL(path, this.origin)
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
    const response = await this.doFetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(150_000),
    })
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    if (!response.ok) throw new Error(payload.error || `the WhatsApp bridge answered ${response.status}`)
    return payload as T
  }

  status = (): Promise<BridgeStatus> => this.call('GET', '/status')
  contacts = (q: string): Promise<BridgeContact[]> => this.call('GET', '/contacts', { q })
  chats = (query: { q?: string; limit?: number }): Promise<BridgeChat[]> => this.call('GET', '/chats', query)
  messages = (filter: MessageFilter): Promise<BridgeMessage[]> => this.call('GET', '/messages', { ...filter })
  send = (body: SendBody): Promise<{ id: string }> => this.call('POST', '/send', undefined, body)
  download = (chat: string, message: string): Promise<{ path: string; type: string; bytes: number }> =>
    this.call('POST', '/download', undefined, { chat, message })
  backfill = (chat: string, since: number | undefined, max: number | undefined): Promise<BackfillResult> =>
    this.call('POST', '/backfill', undefined, { chat, since, max })
}
