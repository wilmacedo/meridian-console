import { decodeRaw, splitFields } from './scanner'

export interface ChatMessage {
  kind: 'broadcast' | 'whisper'
  channel: string
  from: string
  to?: string
  message: string
}

// Broadcast (zone/guild/etc.) chat: `%xt%chatm%-1%<channel>~<message>%<username>%<id>%-1%0%`.
function parseBroadcast(raw: string): ChatMessage | null {
  const fields = splitFields(raw)
  const channelAndMessage = fields[3]
  const from = fields[4]
  if (!channelAndMessage || !from) return null
  const separatorIndex = channelAndMessage.indexOf('~')
  if (separatorIndex === -1) return null
  return {
    kind: 'broadcast',
    channel: channelAndMessage.slice(0, separatorIndex),
    message: channelAndMessage.slice(separatorIndex + 1),
    from,
  }
}

// Whisper (private message): `%xt%whisper%-1%<message>%<from>%<to>%0%0%` — no channel~message
// split since it's inherently one recipient, but carries that recipient's name instead.
function parseWhisper(raw: string): ChatMessage | null {
  const fields = splitFields(raw)
  const message = fields[3]
  const from = fields[4]
  const to = fields[5]
  if (!message || !from || !to) return null
  return { kind: 'whisper', channel: 'whisper', from, to, message }
}

export function parseChatMessage(raw: string): ChatMessage | null {
  if (raw.startsWith('%xt%chatm%')) return parseBroadcast(raw)
  if (raw.startsWith('%xt%whisper%')) return parseWhisper(raw)
  return null
}

export function humanDecode(raw: string): string {
  const chat = parseChatMessage(raw)
  if (!chat) return decodeRaw(raw)
  return chat.kind === 'whisper' ? `[whisper] ${chat.from} → ${chat.to}: ${chat.message}` : `[${chat.channel}] ${chat.from}: ${chat.message}`
}
