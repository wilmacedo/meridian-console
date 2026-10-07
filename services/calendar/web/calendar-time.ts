export const DAY_MS = 86_400_000

export interface WireEvent {
  id: string
  sourceId: string
  title: string
  start: string
  end: string
  allDay: boolean
  location?: string
  joinUrl?: string
  openUrl?: string
  alsoIn: string[]
}

// An all-day event's dates are local days; `end` is the midnight after its last day.
export interface CalEvent extends Omit<WireEvent, 'start' | 'end'> {
  start: Date
  end: Date
}

export interface LaidOut extends CalEvent {
  lane: number
  lanes: number
}

export const pad = (n: number): string => String(n).padStart(2, '0')
export const sod = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const addD = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
export const sameD = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
export const monOf = (d: Date): Date => addD(d, -((d.getDay() + 6) % 7))
export const hm = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`

export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / DAY_MS + 1) / 7)
}

export const durTxt = (minutes: number): string => (minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${pad(minutes % 60)}m` : ''}` : `${minutes}m`)

export function relTxt(e: Pick<CalEvent, 'start' | 'end'>, now: Date): string {
  if (now >= e.start && now < e.end) return 'NOW'
  if (now >= e.end) return 'ENDED'
  const m = Math.round((e.start.getTime() - now.getTime()) / 60_000)
  return m < 60 ? `IN ${m}M` : m < 1440 ? `IN ${Math.floor(m / 60)}H ${pad(m % 60)}M` : `IN ${Math.round(m / 1440)}D`
}

const localDay = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

export function toCalEvent(raw: WireEvent): CalEvent {
  return { ...raw, start: raw.allDay ? localDay(raw.start) : new Date(raw.start), end: raw.allDay ? localDay(raw.end) : new Date(raw.end) }
}

// Events that touch the day, all-day ones first, then by start.
export function eventsOn(events: CalEvent[], day: Date): CalEvent[] {
  const from = day.getTime()
  const to = addD(day, 1).getTime()
  return events
    .filter((e) => e.start.getTime() < to && e.end.getTime() > from && (e.end.getTime() > e.start.getTime() || e.start.getTime() >= from))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime())
}

// A block is never drawn shorter than 20px (about 27 minutes of the grid), so a short event takes up that much room
// when deciding who shares a lane; otherwise two back-to-back stand-ups would be drawn on top of each other.
const MIN_BLOCK_MS = 27 * 60_000

// Side-by-side lanes for events that overlap in time, like the design's.
export function layoutLanes(events: CalEvent[]): LaidOut[] {
  const out: LaidOut[] = []
  let cluster: LaidOut[] = []
  let clusterEnd = 0
  const occupiedUntil = (e: CalEvent): number => Math.max(e.end.getTime(), e.start.getTime() + MIN_BLOCK_MS)
  const flush = () => {
    const laneEnds: number[] = []
    for (const e of cluster) {
      let lane = laneEnds.findIndex((end) => end <= e.start.getTime())
      if (lane < 0) {
        lane = laneEnds.length
        laneEnds.push(0)
      }
      laneEnds[lane] = occupiedUntil(e)
      e.lane = lane
    }
    for (const e of cluster) {
      e.lanes = laneEnds.length
      out.push(e)
    }
    cluster = []
  }
  for (const ev of events) {
    if (cluster.length && ev.start.getTime() >= clusterEnd) flush()
    cluster.push({ ...ev, lane: 0, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, occupiedUntil(ev))
  }
  if (cluster.length) flush()
  return out
}

// Same recipe as the design's `calTone`: one hue, three strengths.
export const tone = (hue: number | undefined): { color: string; fill: string; line: string } =>
  hue === undefined
    ? { color: 'rgb(var(--nx-ac))', fill: 'rgba(var(--nx-ac), 0.12)', line: 'rgba(var(--nx-ac), 0.5)' }
    : { color: `oklch(0.78 0.12 ${hue})`, fill: `oklch(0.78 0.12 ${hue} / 0.16)`, line: `oklch(0.78 0.12 ${hue} / 0.6)` }

// Six weeks always: the grid keeps its height from month to month.
export function monthGrid(anchor: Date, monthOffset: number): { base: Date; days: Date[] } {
  const base = new Date(anchor.getFullYear(), anchor.getMonth() + monthOffset, 1)
  const first = monOf(base)
  const monthDays = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  const cells = Math.ceil((((base.getDay() + 6) % 7) + monthDays) / 7) * 7
  return { base, days: Array.from({ length: cells }, (_, i) => addD(first, i)) }
}
