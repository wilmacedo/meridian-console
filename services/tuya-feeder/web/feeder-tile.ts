import type { WidgetTile } from '@meridian/service-sdk/web'
import type { FeederStatus } from './feeder-state.svelte'

const pad = (n: number): string => String(n).padStart(2, '0')

// Food storage is an enum on this device; under this level the hopper is as good as empty.
const LOW_LEVEL = 20

export interface FeederView {
  status: FeederStatus | undefined
  unreachable: boolean
  dispensing: boolean
  // 0-100 and the label for the hopper, if it was ever read.
  hopper: { label: string; level: number } | undefined
}

// The car layout's tile (design v12). The design shows the next scheduled feeding, but the device's schedule is not
// decoded yet (see README), so this shows the last one and the hopper.
export function feederTile(view: FeederView, now: Date): WidgetTile {
  const bar = view.hopper ? { value: view.hopper.level, tone: view.hopper.level < LOW_LEVEL ? ('warn' as const) : undefined } : undefined
  if (view.unreachable) return { kicker: 'FEEDER', value: '—', valueSize: 'number', sub: 'Unreachable', subTone: 'bad', tone: 'bad', bar }
  const last = view.status?.lastFeed
  const hopper = view.hopper ? `hopper ${view.hopper.label.toLowerCase()}` : 'hopper unknown'
  const low = !!view.hopper && view.hopper.level < LOW_LEVEL
  if (!last) return { kicker: 'LAST FED', value: '—', valueSize: 'number', sub: view.dispensing ? 'Dispensing now' : hopper, tone: low ? 'warn' : 'ok', bar }
  const when = new Date(last.at)
  const time = `${pad(when.getHours())}:${pad(when.getMinutes())}`
  const day = when.toDateString() === now.toDateString() ? '' : `${pad(when.getDate())}/${pad(when.getMonth() + 1)} · `
  const portions = last.portions === 0 ? 'failed' : `${last.portions} portion${last.portions > 1 ? 's' : ''}`
  return {
    kicker: 'LAST FED',
    value: time,
    valueSize: 'number',
    sub: view.dispensing ? 'Dispensing now' : `${day}${portions} · ${hopper}`,
    tone: last.portions === 0 || low ? 'warn' : 'ok',
    bar,
  }
}
