export type LogLevel = 'INFO' | 'WARN' | 'ERR'

// Fixture pool for the generic service panel's log stream — see
// docs/design-handoff.md#screen-3--service-panel-generic-kind--packet. Real integration swaps
// this for the service's actual log tail.
export const logLinePool: [LogLevel, string][] = [
  ['INFO', 'state machine tick · 214 entities polled'],
  ['INFO', 'mqtt bridge: 3 topics republished'],
  ['WARN', 'zwave node 12 slow ack (312ms)'],
  ['INFO', "automation 'dusk_protocol' fired"],
  ['INFO', 'recorder purge complete · 1.2 GB reclaimed'],
  ['ERR', "integration 'shelly' retry 2/5"],
  ['INFO', 'websocket client connected · 10.20.1.44'],
  ['INFO', "scene 'night_watch' applied to 6 entities"],
]
