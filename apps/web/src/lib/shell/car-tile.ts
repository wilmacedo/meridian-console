import type { MeridianEvent, ServiceSummary, TelemetrySample } from '@meridian/service-sdk'
import type { WidgetTile } from '@meridian/service-sdk/web'
import type { WidgetDef } from '../dock/widgets'

// What the car layout shows for a widget (design v12, `cpTile`). The built-in widgets are summarised here from the
// live data; a service's widget summarises itself through `tile()`, because the core never names a service.
export interface TileData {
  // The newest sample, if any.
  sample: TelemetrySample | undefined
  // The services the workspace shows (retired ones left out).
  services: readonly ServiceSummary[]
  // Newest first.
  events: readonly MeridianEvent[]
}

const HOT_C = 70
const EVENTS_LOOKED_AT = 30

function telemetry(sample: TelemetrySample | undefined): WidgetTile {
  if (!sample) return { kicker: 'SERVER', value: '—', unit: '% CPU', sub: 'No data yet', valueSize: 'number' }
  const cpu = Math.round(sample.cpu)
  const hot = sample.temp !== null && sample.temp > HOT_C
  const temp = sample.temp === null ? '' : ` · ${Math.round(sample.temp)}°C`
  return { kicker: 'SERVER', value: String(cpu), unit: '% CPU', sub: `${sample.mem.toFixed(1)} GB${temp}`, valueSize: 'number', tone: hot ? 'bad' : 'ok', subTone: hot ? 'bad' : 'dim', bar: { value: cpu } }
}

function services(list: readonly ServiceSummary[]): WidgetTile {
  const online = list.filter((s) => s.status.state === 'online').length
  const degraded = list.filter((s) => s.status.state === 'degraded')
  const offline = list.filter((s) => s.status.state === 'offline')
  const tone = degraded.length ? 'warn' : offline.length ? 'bad' : 'ok'
  const sub = degraded.length ? `${degraded[0].name} degraded` : offline.length ? `${offline[0].name} offline` : 'All nominal'
  return { kicker: 'SERVICES', value: `${online}/${list.length}`, unit: 'ONLINE', sub, valueSize: 'number', tone, subTone: tone === 'ok' ? 'dim' : tone }
}

function logs(events: readonly MeridianEvent[], source: string): WidgetTile {
  const mine = (source === 'all' ? events : events.filter((e) => e.source === source)).slice(0, EVENTS_LOOKED_AT)
  const alerts = mine.filter((e) => e.level !== 'info').length
  const latest = mine[0]
  return {
    kicker: source === 'all' ? 'EVENTS' : source.toUpperCase(),
    value: String(alerts),
    unit: alerts === 1 ? 'ALERT' : 'ALERTS',
    sub: latest ? `${source === 'all' ? `${latest.source} · ` : ''}${latest.message}` : 'Quiet',
    valueSize: 'number',
    tone: alerts ? 'warn' : 'ok',
  }
}

// `own` is the widget's own summary, for a type the core does not know.
export function carTile(def: WidgetDef, data: TileData, own?: () => WidgetTile): WidgetTile {
  if (def.type === 'tele') return telemetry(data.sample)
  if (def.type === 'services') return services(data.services)
  if (def.type === 'logs') return logs(data.events, def.svc ?? 'all')
  const mine = own?.()
  if (mine) return mine
  return { kicker: def.type === 'doc' ? 'NOX · BRIEF' : 'NOX', value: def.title, valueSize: 'text', sub: def.kicker }
}

// The window a tap on a built-in widget's tile opens; a service's widget names its own (`opens`).
export const BUILT_IN_WINDOW: Record<string, string> = { tele: 'telemetry', services: 'services', logs: 'logs', doc: 'doc' }
