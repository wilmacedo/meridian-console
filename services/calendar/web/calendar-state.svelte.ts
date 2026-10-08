import { untrack } from 'svelte'
import { addD, eventsOn, monOf, sod, toCalEvent, tone, type CalEvent, type WireEvent } from './calendar-time'

export interface SourceInfo {
  id: string
  accountId: string
  label: string
  account: string
  provider: string
  accessRole: string
  hue: number
  visible: boolean
  isDefault: boolean
  status: 'ok' | 'pending'
}

export type View = 'day' | 'week' | 'agenda'

interface Loaded {
  events: CalEvent[]
}

const BASE = '/api/services/calendar'
const POLL_MS = 5000
// Google is asked at most once a minute per calendar (the server caches), so asking the server more often buys nothing.
const REFRESH_MS = 60_000

// Shared by the window and the dock widget, so both show the same calendars at the same moment.
export const cal = $state({
  loaded: false,
  configured: true,
  message: '',
  unreachable: false,
  sources: [] as SourceInfo[],
  now: new Date(),
  // Ranges asked for and still waiting for their first answer.
  fetching: 0,
})

export const ui = $state({ view: 'week' as View, anchor: sod(new Date()), monthOffset: 0, selectedId: null as string | null })

const loaded = $state<Record<string, Loaded>>({})
const active = new Map<string, { from: Date; to: Date; count: number }>()
const generation = new Map<string, number>()
let rev = -1
let watchers = 0
let timer: ReturnType<typeof setInterval> | undefined
let lastRefresh = 0

const keyOf = (from: Date, to: Date): string => `${from.getTime()}|${to.getTime()}`

async function loadRange(key: string): Promise<void> {
  const range = active.get(key)
  if (!range) return
  const first = !loaded[key]
  const mine = (generation.get(key) ?? 0) + 1
  generation.set(key, mine)
  if (first) cal.fetching += 1
  try {
    const res = await fetch(`${BASE}/events?${new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() })}`)
    if (!res.ok) throw new Error(`events responded ${res.status}`)
    const body = (await res.json()) as { events: WireEvent[] }
    if (generation.get(key) === mine) loaded[key] = { events: body.events.map(toCalEvent) }
    cal.unreachable = false
  } catch {
    cal.unreachable = true
  } finally {
    if (first) cal.fetching -= 1
  }
}

const reloadAll = (): void => {
  lastRefresh = Date.now()
  for (const key of active.keys()) void loadRange(key)
}

export async function refreshSources(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/sources`)
    if (!res.ok) throw new Error(`sources responded ${res.status}`)
    const body = (await res.json()) as { configured: boolean; message?: string; rev: number; sources: SourceInfo[] }
    cal.configured = body.configured
    cal.message = body.message ?? ''
    cal.sources = body.sources
    cal.loaded = true
    cal.unreachable = false
    const changed = body.rev !== rev
    rev = body.rev
    return changed
  } catch {
    cal.unreachable = true
    return false
  }
}

async function tick(): Promise<void> {
  cal.now = new Date()
  const changed = await refreshSources()
  if (changed || Date.now() - lastRefresh >= REFRESH_MS) reloadAll()
}

const onVisible = (): void => {
  if (document.visibilityState === 'visible') void tick()
}

// Components call this on mount; the poll runs while at least one is showing.
export function watchCalendar(): () => void {
  watchers += 1
  if (watchers === 1) {
    timer = setInterval(() => void tick(), POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
  }
  void tick()
  return () => {
    watchers -= 1
    if (watchers === 0) {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }
}

// Asks for a time range; returns the function that lets go of it. Meant to run inside an $effect.
export function trackRange(from: Date, to: Date): () => void {
  const key = keyOf(from, to)
  // It reads and writes the shared state, which an effect that calls it must not depend on.
  untrack(() => {
    const entry = active.get(key)
    if (entry) entry.count += 1
    else {
      active.set(key, { from, to, count: 1 })
      void loadRange(key)
    }
  })
  return () => {
    const current = active.get(key)
    if (!current) return
    current.count -= 1
    if (current.count === 0) active.delete(key)
  }
}

// The day the clock is on; reading it inside an effect makes that effect run again at midnight and no sooner.
const today = $derived(sod(cal.now).getTime())

// Keeps today and tomorrow loaded for the tile in the car layout, which has no widget of its own to do it.
export function watchToday(): () => void {
  const stop = watchCalendar()
  const from = new Date(today)
  const release = trackRange(from, addD(from, 2))
  return () => {
    release()
    stop()
  }
}

// What the car layout's tile reads: the timed events of today, in order.
export function todayTimed(): { title: string; start: Date; end: Date; color: string }[] {
  const from = sod(cal.now)
  return eventsOn(eventsIn(from, addD(from, 2)), from)
    .filter((e) => !e.allDay)
    .map((e) => ({ title: e.title, start: e.start, end: e.end, color: toneOf(e.sourceId).color }))
}

export function eventsIn(from: Date, to: Date): CalEvent[] {
  return loaded[keyOf(from, to)]?.events ?? []
}

export const rangeLoaded = (from: Date, to: Date): boolean => keyOf(from, to) in loaded

export async function toggleSource(id: string): Promise<void> {
  const source = cal.sources.find((s) => s.id === id)
  if (!source || source.status === 'pending') return
  source.visible = !source.visible
  ui.selectedId = null
  await fetch(`${BASE}/sources/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visible: source.visible }) })
  void tick()
}

// The sign-in happens on Google's page in a new tab; the poll notices the new calendars when it ends.
export function signIn(accountId?: string): void {
  const query = accountId ? `?${new URLSearchParams({ account: accountId })}` : ''
  window.open(`${BASE}/oauth/start${query}`, '_blank')
}

export const weekRange = (day: Date): { from: Date; to: Date } => {
  const from = monOf(day)
  return { from, to: addD(from, 7) }
}

export function footer(): string {
  const { from, to } = weekRange(cal.now)
  const shown = cal.sources.filter((s) => s.visible).length
  return `${eventsIn(from, to).length} EVENTS THIS WEEK · ${shown}/${cal.sources.length} CALENDARS`
}

export const sourceOf = (id: string): SourceInfo | undefined => cal.sources.find((s) => s.id === id)
export const toneOf = (id: string): ReturnType<typeof tone> => tone(sourceOf(id)?.hue)
