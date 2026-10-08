import type { BridgeClient } from './bridge-client.js'

const PHONE = /^\+?[\d\s-]{7,}$/

// A chat is named by the model as an id from an earlier result, a phone number, or a person or group name.
export async function resolveChat(client: Pick<BridgeClient, 'contacts'>, ref: string): Promise<string> {
  const text = ref.trim()
  if (!text) throw new Error('chat is required')
  if (text.includes('@')) return text
  if (PHONE.test(text)) return text.replace(/\D/g, '')

  const matches = await client.contacts(text)
  const exact = matches.filter((c) => c.name.toLowerCase() === text.toLowerCase())
  const pool = exact.length === 1 ? exact : matches
  if (pool.length === 1) return pool[0]!.jid
  if (pool.length === 0) throw new Error(`no contact or group matches "${text}"; try search-contacts with part of the name`)
  throw new Error(`"${text}" matches several chats, ask the owner which one: ${pool.slice(0, 8).map((c) => `${c.name}${c.isGroup ? ' (group)' : ''} [${c.jid}]`).join('; ')}`)
}

const ONLY_DAY = /^\d{4}-\d{2}-\d{2}$/

// A bare date is a local day; "to" then includes that whole day.
export function parseWhen(value: string | undefined, name: string, endOfDay = false): number | undefined {
  if (!value) return undefined
  if (ONLY_DAY.test(value)) {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number]
    return new Date(y, m - 1, d + (endOfDay ? 1 : 0)).getTime()
  }
  const time = Date.parse(value)
  if (Number.isNaN(time)) throw new Error(`${name} must be YYYY-MM-DD or an ISO date-time`)
  return time
}
