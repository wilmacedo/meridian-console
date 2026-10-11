// The owner's own Telegram bot, used only to send them messages: a message from a bot is someone else's, so the
// phone notifies, where a note in the owner's own WhatsApp chat arrives silently. The bot may also be read by
// another program (n8n), so this never asks Telegram for updates: polling would take them from it.

const API = 'https://api.telegram.org'
const TIMEOUT_MS = 10_000
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

export interface TelegramConfig {
  token: string
  chatId: string
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): TelegramConfig | undefined {
  const token = env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = env.TELEGRAM_CHAT_ID?.trim()
  return token && chatId ? { token, chatId } : undefined
}

// A stop for a loop, so the owner's phone is never flooded.
export class Limiter {
  private sent: number[] = []

  constructor(
    private readonly perMinute = 3,
    private readonly perHour = 10,
    private readonly now: () => number = Date.now,
  ) {}

  check(): void {
    const t = this.now()
    this.sent = this.sent.filter((s) => t - s < HOUR_MS)
    if (this.sent.length >= this.perHour) throw new Error(`that is ${this.perHour} messages in the last hour; wait before sending more`)
    if (this.sent.filter((s) => t - s < MINUTE_MS).length >= this.perMinute) throw new Error('too many messages in a minute; wait a little')
  }

  record(): void {
    this.sent.push(this.now())
  }
}

export class TelegramClient {
  constructor(
    private readonly config: TelegramConfig,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  private async call<T>(method: string, body?: unknown): Promise<T> {
    const response = await this.doFetch(`${API}/bot${this.config.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string }
    // Telegram's description never carries the token; the URL that does is never put in an error.
    if (!payload.ok) throw new Error(`Telegram refused ${method}: ${payload.description ?? `HTTP ${response.status}`}`)
    return payload.result as T
  }

  me = (): Promise<{ username: string }> => this.call('getMe')

  sendToOwner = (text: string): Promise<{ message_id: number }> => this.call('sendMessage', { chat_id: this.config.chatId, text })
}
