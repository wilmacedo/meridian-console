import { defineServerService, type Emit, type ServiceStatus } from '@meridian/service-sdk/server'
import { Limiter, readConfig, TelegramClient } from './telegram.js'

const MAX_TEXT = 1_000
// getMe only proves the token works; asking once in a while is enough.
const STATUS_TTL_MS = 10 * 60_000

const config = readConfig()
const client = config && new TelegramClient(config)
const limiter = new Limiter()
let emit: Emit | undefined
let checked: { at: number; status: ServiceStatus } | undefined

export default defineServerService({
  manifest: { id: 'telegram', name: 'telegram', desc: "Messages to the owner from their own Telegram bot, so the phone notifies", runtime: 'api' },
  status: async () => {
    if (!client) return { state: 'offline', message: 'set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID' }
    if (checked && Date.now() - checked.at < STATUS_TTL_MS) return checked.status
    const status: ServiceStatus = await client.me().then(
      (me) => ({ state: 'online', message: `@${me.username}` }),
      (err: unknown) => ({ state: 'offline', message: err instanceof Error ? err.message : 'Telegram does not answer' }),
    )
    checked = { at: Date.now(), status }
    return status
  },
  actions: [
    {
      id: 'notify-owner',
      method: 'POST',
      path: '/notify-owner',
      title: 'Message the owner',
      description:
        "Sends the owner a short message from their own Telegram bot, which notifies on their phone wherever they are. Nobody else can receive it: there is no recipient to choose. It is how Meridian's reminders reach the owner away from the screens; use it yourself only when the owner asks you to send them something on Telegram.",
      mutating: false,
      input: { type: 'object', required: ['text'], additionalProperties: false, properties: { text: { type: 'string', minLength: 1, maxLength: MAX_TEXT } } },
      run: async ({ text }: { text: string }) => {
        if (!client) throw new Error('Telegram is not set up: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID go in .env')
        limiter.check()
        await client.sendToOwner(text)
        limiter.record()
        emit?.('info', 'telegram: sent a message to the owner')
        return { sent: true }
      },
    },
  ],
  events: (e) => {
    emit = e
    return () => (emit = undefined)
  },
})
