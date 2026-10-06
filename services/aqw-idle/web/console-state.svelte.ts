export type LogLevel = 'PKT' | 'INFO' | 'WARN' | 'ERR' | 'DROP'
export type LogDirection = 'IN' | 'OUT' | '··'

export interface LogEntry {
  id: number
  lvl: LogLevel
  dir: LogDirection
  chan: string
  raw: string
  t: string
  epochMs: number
}

interface PacketMessage {
  raw: string
  direction: 'in' | 'out'
  t: number
}

export const consoleState = $state({
  feed: [] as LogEntry[],
  seq: 0,
  packetSel: 0,
  q: '',
  // Default view is chat/whisper only — gameplay noise (zone/server/runtime) starts hidden.
  lvlOff: { INFO: true, WARN: true, ERR: true, DROP: true } as Record<string, boolean>,
  chanOff: { zm: true, srv: true, sys: true } as Record<string, boolean>,
  decode: true,
  follow: true,
  connected: false,
})

let socket: WebSocket | undefined
let reconnectTimer: ReturnType<typeof setTimeout> | undefined
let stopped = true

// Bucketed by prefix, not told by the source — `chatm` broadcasts and `whisper` private messages
// share the `chat` bucket (so all player chat can be isolated from gameplay noise), `zm` is
// zone/gameplay commands, `server`-prefixed traffic is `srv`, everything else (login/policy/verChk
// XML, and anything not yet seen) is `sys`.
function channelFor(raw: string): string {
  if (raw.startsWith('%xt%chatm%') || raw.startsWith('%xt%whisper%')) return 'chat'
  if (raw.startsWith('%xt%zm%')) return 'zm'
  if (raw.startsWith('%xt%server%')) return 'srv'
  return 'sys'
}

function formatTime(d: Date): string {
  return `${[d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':')}.${String(d.getMilliseconds()).padStart(3, '0').slice(0, 2)}`
}

function pushEntry(message: PacketMessage) {
  if (!consoleState.follow) return
  const entry: LogEntry = {
    id: consoleState.seq + 1,
    lvl: 'PKT',
    dir: message.direction === 'out' ? 'OUT' : 'IN',
    chan: channelFor(message.raw),
    raw: message.raw,
    t: formatTime(new Date(message.t)),
    epochMs: message.t,
  }
  consoleState.seq += 1
  consoleState.feed = [...consoleState.feed, entry]
}

// Closes whatever socket was open first — connect() can otherwise be called again (e.g. a fast
// remount) before the previous one has finished closing, leaving a stale socket whose listeners
// are still live to double- or triple-push every incoming packet.
function connect() {
  socket?.close()

  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${proto}://${location.host}/api/services/aqw-idle/packets`)
  socket = ws

  // Guards below ignore events from a socket that's no longer the current one — needed because a
  // superseded socket's own `close` event can still fire after connect() has already moved on.
  ws.addEventListener('open', () => {
    if (socket !== ws) return
    consoleState.connected = true
  })

  ws.addEventListener('message', (event) => {
    if (socket !== ws) return
    pushEntry(JSON.parse(event.data) as PacketMessage)
  })

  ws.addEventListener('close', () => {
    if (socket !== ws) return
    consoleState.connected = false
    if (!stopped) reconnectTimer = setTimeout(connect, 3_000)
  })
}

export function startPacketFeed() {
  stopped = false
  connect()
}

export function stopPacketFeed() {
  stopped = true
  clearTimeout(reconnectTimer)
  socket?.close()
  socket = undefined
}

export function clearFeed() {
  consoleState.feed = []
  consoleState.packetSel = 0
}
