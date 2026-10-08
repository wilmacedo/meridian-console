import type { WidgetTile } from '@meridian/service-sdk/web'
import { hm, relTxt, type CalEvent } from './calendar-time'

export interface TileEvent extends Pick<CalEvent, 'title' | 'start' | 'end'> {
  color: string
}

// The car layout's tile (design v12): what is on now or next today, with how long it has left or how far off it is.
// `today` is the day's timed events, in order.
export function calendarTile(today: readonly TileEvent[], now: Date): WidgetTile {
  const current = today.find((e) => e.start <= now && e.end > now)
  const head = current ?? today.find((e) => e.start > now)
  if (!head) return { kicker: 'TODAY', value: 'All clear', valueSize: 'text', sub: 'Nothing left today' }
  const title = head.title || '(sem título)'
  if (!current) return { kicker: `NEXT · ${hm(head.start)}`, value: title, valueSize: 'text', sub: relTxt(head, now), accent: head.color }
  const left = Math.max(1, Math.round((current.end.getTime() - now.getTime()) / 60_000))
  const done = ((now.getTime() - current.start.getTime()) / (current.end.getTime() - current.start.getTime())) * 100
  return { kicker: 'NOW', value: title, valueSize: 'text', sub: `${left} min left`, accent: head.color, bar: { value: done } }
}
