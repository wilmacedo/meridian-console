import { logPool, type LogDirection, type LogLevel } from './pool'

export interface LogEntry {
  id: number
  lvl: LogLevel
  dir: LogDirection
  chan: string
  raw: string
  t: string
}

export const consoleState = $state({
  feed: [] as LogEntry[],
  seq: 4200,
  packetSel: 0,
  q: '',
  lvlOff: {} as Record<string, boolean>,
  chanOff: {} as Record<string, boolean>,
  decode: true,
  follow: true,
})

function pushFeed(n: number) {
  if (!consoleState.follow) return
  const pooled = logPool[(consoleState.seq + n) % logPool.length]
  const d = new Date()
  const entry: LogEntry = {
    id: consoleState.seq + 1,
    lvl: pooled.lvl,
    dir: pooled.dir,
    chan: pooled.chan,
    raw: pooled.raw.replace('{n}', String(4200 + (consoleState.seq % 700))),
    t: `${[d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':')}.${String(d.getMilliseconds()).padStart(3, '0').slice(0, 2)}`,
  }
  consoleState.seq += 1
  consoleState.feed = [...consoleState.feed, entry].slice(-160)
}

let feedTimer: ReturnType<typeof setInterval> | undefined

export function startPacketFeed() {
  if (consoleState.feed.length === 0) {
    for (let k = 0; k < 26; k++) pushFeed(k)
  }
  feedTimer = setInterval(() => pushFeed(0), 900)
}

export function stopPacketFeed() {
  clearInterval(feedTimer)
}

export function clearFeed() {
  consoleState.feed = []
  consoleState.packetSel = 0
}
