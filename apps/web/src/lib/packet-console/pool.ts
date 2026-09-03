export type LogLevel = 'PKT' | 'INFO' | 'WARN' | 'ERR' | 'DROP'
export type LogDirection = 'IN' | 'OUT' | '··'

export interface PoolEntry {
  lvl: LogLevel
  dir: LogDirection
  chan: string
  raw: string
}

// Fixture pool cycled by the feed timer — see
// docs/design-handoff.md#screen-4--service-panel-packet-console-kind--packet-ie-aqw-idle. `{n}`
// is replaced with a rolling counter when the entry is pushed. Real integration swaps this for the
// actual socket/log tail.
export const logPool: PoolEntry[] = [
  { lvl: 'PKT', dir: 'IN', chan: 'zm', raw: '%xt%zm%addGoldExp%1%1250%340%0%' },
  { lvl: 'PKT', dir: 'IN', chan: 'zm', raw: '%xt%zm%getDrop%1%Blade%20of%20Awe%1%' },
  { lvl: 'PKT', dir: 'OUT', chan: 'zm', raw: '%xt%zm%aggroMon%1%3%' },
  { lvl: 'INFO', dir: '··', chan: 'sys', raw: 'idle%20loop%20tick%20%23{n}%20%7C%20quests%205%2F5' },
  { lvl: 'PKT', dir: 'IN', chan: 'zm', raw: '%xt%zm%questRewards%1%2400%12%' },
  { lvl: 'WARN', dir: '··', chan: 'sys', raw: 'server%20lag%20detected%20%3A%20rtt%3A%20412ms' },
  { lvl: 'PKT', dir: 'OUT', chan: 'zm', raw: '%xt%zm%cmd%1%tfer%20yorumi-1%' },
  { lvl: 'PKT', dir: 'IN', chan: 'srv', raw: '%xt%server%moderator%0%Server%20restart%20in%2010%20min%' },
  { lvl: 'ERR', dir: '··', chan: 'sys', raw: 'packet%20parse%20failed%3A%20unexpected%20token%20%5B' },
  { lvl: 'PKT', dir: 'IN', chan: 'zm', raw: '%xt%zm%mtls%1%0%1%' },
  { lvl: 'INFO', dir: '··', chan: 'sys', raw: 'rest%20complete%20%7C%20hp%3A%20100%25' },
  { lvl: 'PKT', dir: 'OUT', chan: 'zm', raw: '%xt%zm%gar%1%2%' },
  { lvl: 'DROP', dir: '··', chan: 'sys', raw: 'dropped%201%20duplicate%20frame%20%23{n}' },
  { lvl: 'PKT', dir: 'IN', chan: 'zm', raw: '%xt%zm%stu%1%%7B%22intAP%22%3A12%2C%22intSP%22%3A4%7D%' },
  { lvl: 'PKT', dir: 'IN', chan: 'srv', raw: '%xt%server%uotls%0%yorumi%20afk%3Dfalse%' },
  { lvl: 'PKT', dir: 'OUT', chan: 'zm', raw: '%xt%zm%respawnMon%1%Undead%20Warrior%' },
]
