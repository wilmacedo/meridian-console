import { describe, expect, it } from 'vitest'
import type { FeederStatus } from './feeder-state.svelte'
import { feederTile, type FeederView } from './feeder-tile'

const now = new Date(2026, 9, 8, 20, 0)
const fed = (when: Date, portions = 1): FeederStatus => ({ lastFeed: { portions, source: 'auto', at: when.toISOString() }, battery: null, foodStorage: null, blocked: false })
const view = (extra: Partial<FeederView> = {}): FeederView => ({ status: fed(new Date(2026, 9, 8, 19, 30)), unreachable: false, dispensing: false, hopper: { label: 'FULL', level: 100 }, ...extra })

describe('feederTile', () => {
  it('shows the last feeding and the hopper', () => {
    expect(feederTile(view(), now)).toMatchObject({ kicker: 'LAST FED', value: '19:30', valueSize: 'number', sub: '1 portion · hopper full', tone: 'ok', bar: { value: 100 } })
  })

  it('puts the date on a feeding from another day', () => {
    expect(feederTile(view({ status: fed(new Date(2026, 9, 7, 8, 5), 2) }), now).sub).toBe('07/10 · 2 portions · hopper full')
  })

  it('warns when the hopper is nearly empty', () => {
    const t = feederTile(view({ hopper: { label: 'EMPTY', level: 10 } }), now)
    expect(t).toMatchObject({ tone: 'warn', bar: { value: 10, tone: 'warn' } })
  })

  it('warns about a feeding that failed', () => {
    expect(feederTile(view({ status: fed(new Date(2026, 9, 8, 19, 30), 0) }), now)).toMatchObject({ sub: 'failed · hopper full', tone: 'warn' })
  })

  it('says when it is dispensing', () => {
    expect(feederTile(view({ dispensing: true }), now).sub).toBe('Dispensing now')
  })

  it('says when the feeder cannot be reached', () => {
    expect(feederTile(view({ unreachable: true }), now)).toMatchObject({ value: '—', sub: 'Unreachable', tone: 'bad', subTone: 'bad' })
  })

  it('copes with nothing read yet', () => {
    expect(feederTile({ status: undefined, unreachable: false, dispensing: false, hopper: undefined }, now)).toMatchObject({ value: '—', sub: 'hopper unknown', tone: 'ok' })
  })
})
