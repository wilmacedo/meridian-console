import type { MeridianEvent, ServiceSummary, TelemetrySample } from '@meridian/service-sdk'
import { describe, expect, it } from 'vitest'
import type { WidgetDef } from '../dock/widgets'
import { carTile, type TileData } from './car-tile'

const def = (type: string, extra: Partial<WidgetDef> = {}): WidgetDef => ({ type, src: 'sys', title: 'Title', kicker: 'KICKER', ...extra })
const svc = (name: string, state: 'online' | 'degraded' | 'offline'): ServiceSummary => ({ id: name, name, status: { state } }) as ServiceSummary
const event = (source: string, level: MeridianEvent['level'], message: string): MeridianEvent => ({ id: 1, ts: '2026-10-08T12:00:00Z', source, level, message })
const sample = (cpu: number, mem: number, temp: number | null): TelemetrySample => ({ cpu, mem, temp, net: 0 })
const data = (extra: Partial<TileData> = {}): TileData => ({ sample: undefined, services: [], events: [], ...extra })

describe('telemetry tile', () => {
  it('shows the CPU, memory and temperature', () => {
    expect(carTile(def('tele'), data({ sample: sample(24.4, 20.14, 53.2) }))).toMatchObject({ kicker: 'SERVER', value: '24', unit: '% CPU', sub: '20.1 GB · 53°C', tone: 'ok', bar: { value: 24 } })
  })

  it('goes red above 70 degrees', () => {
    expect(carTile(def('tele'), data({ sample: sample(10, 4, 71) }))).toMatchObject({ tone: 'bad', subTone: 'bad' })
    expect(carTile(def('tele'), data({ sample: sample(10, 4, 70) }))).toMatchObject({ tone: 'ok' })
  })

  it('leaves the temperature out when the host has no sensor', () => {
    expect(carTile(def('tele'), data({ sample: sample(10, 4, null) })).sub).toBe('4.0 GB')
  })

  it('says so when nothing has arrived', () => {
    expect(carTile(def('tele'), data()).sub).toBe('No data yet')
  })
})

describe('services tile', () => {
  it('counts the online ones', () => {
    expect(carTile(def('services'), data({ services: [svc('a', 'online'), svc('b', 'online')] }))).toMatchObject({ value: '2/2', unit: 'ONLINE', sub: 'All nominal', tone: 'ok', subTone: 'dim' })
  })

  it('names a degraded service before an offline one', () => {
    const t = carTile(def('services'), data({ services: [svc('a', 'online'), svc('ledger', 'degraded'), svc('mirror', 'offline')] }))
    expect(t).toMatchObject({ value: '1/3', sub: 'ledger degraded', tone: 'warn', subTone: 'warn' })
  })

  it('names an offline one when nothing is degraded', () => {
    expect(carTile(def('services'), data({ services: [svc('mirror', 'offline')] }))).toMatchObject({ sub: 'mirror offline', tone: 'bad' })
  })
})

describe('events tile', () => {
  const events = [event('vault', 'warn', 'slow disk'), event('nox', 'info', 'hello'), event('vault', 'error', 'down')]

  it('counts alerts across everything and names the source of the newest', () => {
    expect(carTile(def('logs', { svc: 'all' }), data({ events }))).toMatchObject({ kicker: 'EVENTS', value: '2', unit: 'ALERTS', sub: 'vault · slow disk', tone: 'warn' })
  })

  it('looks at one source only', () => {
    expect(carTile(def('logs', { svc: 'nox' }), data({ events }))).toMatchObject({ kicker: 'NOX', value: '0', unit: 'ALERTS', sub: 'hello', tone: 'ok' })
  })

  it('uses the singular for one alert, and is quiet without events', () => {
    expect(carTile(def('logs', { svc: 'all' }), data({ events: [event('a', 'warn', 'x')] })).unit).toBe('ALERT')
    expect(carTile(def('logs', { svc: 'all' }), data()).sub).toBe('Quiet')
  })
})

describe('other widgets', () => {
  it("use the service's own summary when it has one", () => {
    expect(carTile(def('cal'), data(), () => ({ kicker: 'NEXT · 15:00', value: 'Sprint planning' })).kicker).toBe('NEXT · 15:00')
  })

  it('fall back to the title and the kicker', () => {
    expect(carTile(def('cal'), data())).toMatchObject({ kicker: 'NOX', value: 'Title', valueSize: 'text', sub: 'KICKER' })
    expect(carTile(def('doc'), data()).kicker).toBe('NOX · BRIEF')
  })
})
