import { describe, expect, it } from 'vitest'
import { Limiter, readConfig, TelegramClient } from './telegram.js'

function fakeFetch(answer: unknown, status = 200) {
  const calls: { url: string; body: unknown }[] = []
  const doFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    return new Response(JSON.stringify(answer), { status })
  }) as unknown as typeof fetch
  return { calls, doFetch }
}

describe('readConfig', () => {
  it('needs both the token and the chat', () => {
    expect(readConfig({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: ' 42 ' })).toEqual({ token: 't', chatId: '42' })
    expect(readConfig({ TELEGRAM_BOT_TOKEN: 't' })).toBeUndefined()
  })
})

describe('TelegramClient', () => {
  it('sends to the configured chat only', async () => {
    const { calls, doFetch } = fakeFetch({ ok: true, result: { message_id: 7 } })
    await new TelegramClient({ token: 'secret', chatId: '42' }, doFetch).sendToOwner('Lembrete: Comprar pão')
    expect(calls).toEqual([{ url: 'https://api.telegram.org/botsecret/sendMessage', body: { chat_id: '42', text: 'Lembrete: Comprar pão' } }])
  })

  it("reports Telegram's reason without the token", async () => {
    const { doFetch } = fakeFetch({ ok: false, description: 'Bad Request: chat not found' }, 400)
    const err = await new TelegramClient({ token: 'secret', chatId: '42' }, doFetch).sendToOwner('x').catch((e: Error) => e)
    expect((err as Error).message).toBe('Telegram refused sendMessage: Bad Request: chat not found')
    expect((err as Error).message).not.toContain('secret')
  })
})

describe('Limiter', () => {
  it('stops a flood', () => {
    let now = 0
    const limiter = new Limiter(3, 10, () => now)
    for (let i = 0; i < 3; i++) (limiter.check(), limiter.record())
    expect(() => limiter.check()).toThrow('too many messages in a minute')
    now = 61_000
    expect(() => limiter.check()).not.toThrow()
  })
})
