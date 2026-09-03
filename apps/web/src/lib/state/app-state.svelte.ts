export type Screen = 'overview' | 'service' | 'home' | 'endpoints' | 'automations'

export const rangeOptions = ['1H', '24H', '3D', '1W', '1M', '3M'] as const
export type Range = (typeof rangeOptions)[number]

interface TelemetrySeries {
  a: number[]
  b: number[]
  c: number[]
}

function seedSeries(length: number, base: number, amplitude: number): number[] {
  return Array.from({ length }, (_, i) => base + Math.sin(i * 0.7) * amplitude + Math.random() * amplitude * 0.5)
}

function bump(values: number[]): number[] {
  const next = values.slice(1)
  const last = values[values.length - 1]
  next.push(Math.max(6, Math.min(94, last + (Math.random() - 0.5) * 20)))
  return next
}

export const appState = $state({
  screen: 'overview' as Screen,
  svcId: 'aqw-idle',
  navOpen: false,
  svcQ: '',
  range: '3D' as Range,
  clock: '--:--:--',
  tick: 0,
  series: {
    a: seedSeries(26, 44, 16),
    b: seedSeries(26, 62, 10),
    c: seedSeries(26, 30, 18),
  } as TelemetrySeries,
  gauge: [62, 48, 22],
})

let clockTimer: ReturnType<typeof setInterval> | undefined
let telemetryTimer: ReturnType<typeof setInterval> | undefined

export function startAppClocks() {
  clockTimer = setInterval(() => {
    const d = new Date()
    appState.clock = [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
  }, 1000)

  telemetryTimer = setInterval(() => {
    appState.tick += 1
    appState.series = {
      a: bump(appState.series.a),
      b: bump(appState.series.b),
      c: bump(appState.series.c),
    }
    appState.gauge = appState.gauge.map((v, i) => Math.max(8, Math.min(96, v + (Math.random() - 0.5) * (i === 2 ? 14 : 8))))
  }, 1200)
}

export function stopAppClocks() {
  clearInterval(clockTimer)
  clearInterval(telemetryTimer)
}
