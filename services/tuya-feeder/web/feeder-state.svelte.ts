export interface Reading<T> {
  value: T
  at: string
}

export interface FeederStatus {
  lastFeed: { portions: number; source: 'manual' | 'auto'; at: string } | null
  battery: Reading<string> | null
  foodStorage: Reading<string> | null
  blocked: boolean
}

type Phase = 'idle' | 'confirming' | 'sending' | 'waiting'

const PORTIONS = 1
const POLL_MS = 30_000
const REPORT_POLL_MS = 2000
const REPORT_ATTEMPTS = 8
const CONFIRM_TIMEOUT_MS = 5000

// Shared by the camera window and the dock widget, so both show the same feeder at the same time.
export const feeder = $state({
  status: undefined as FeederStatus | undefined,
  unreachable: false,
  phase: 'idle' as Phase,
  outcome: undefined as { text: string; ok: boolean } | undefined,
})

async function refresh(): Promise<void> {
  try {
    const res = await fetch('/api/services/tuya-feeder/status')
    if (!res.ok) throw new Error(`status responded ${res.status}`)
    feeder.status = (await res.json()) as FeederStatus
    feeder.unreachable = false
  } catch {
    feeder.unreachable = true
  }
}

let watchers = 0
let pollTimer: ReturnType<typeof setInterval> | undefined

// Polls the feeder while at least one view is showing it.
export function watchFeeder(): () => void {
  if (watchers++ === 0) {
    void refresh()
    pollTimer = setInterval(refresh, POLL_MS)
  }
  return () => {
    if (--watchers === 0) clearInterval(pollTimer)
  }
}

let confirmTimer: ReturnType<typeof setTimeout> | undefined

// Dispensing is two steps on purpose: it puts real food in a real bowl.
export function askDispense(): void {
  feeder.outcome = undefined
  feeder.phase = 'confirming'
  confirmTimer = setTimeout(cancelDispense, CONFIRM_TIMEOUT_MS)
}

export function cancelDispense(): void {
  clearTimeout(confirmTimer)
  feeder.phase = 'idle'
}

export async function confirmDispense(): Promise<void> {
  clearTimeout(confirmTimer)
  // Compare against the device's own previous timestamp so clock skew between machines cannot matter.
  const baseline = feeder.status?.lastFeed?.at
  feeder.phase = 'sending'
  const res = await fetch('/api/services/tuya-feeder/feed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ portions: PORTIONS }),
  }).catch(() => undefined)
  if (!res?.ok) {
    feeder.outcome = { text: res?.status === 429 ? 'WAIT A FEW SECONDS' : 'COMMAND REJECTED', ok: false }
    feeder.phase = 'idle'
    return
  }

  feeder.phase = 'waiting'
  for (let i = 0; i < REPORT_ATTEMPTS; i++) {
    await new Promise((resolve) => setTimeout(resolve, REPORT_POLL_MS))
    await refresh()
    const last = feeder.status?.lastFeed
    if (last && last.at !== baseline) {
      feeder.outcome = last.portions > 0 ? { text: `SERVED ${last.portions}`, ok: true } : { text: 'FEEDING FAILED', ok: false }
      feeder.phase = 'idle'
      return
    }
  }
  feeder.outcome = { text: 'NO REPORT FROM DEVICE', ok: false }
  feeder.phase = 'idle'
}

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

// Food storage is an enum on this device, not a percentage; the bar is only a level indicator.
const HOPPER = { full: { label: 'FULL', level: 100 }, less: { label: 'LOW', level: 45 }, lack: { label: 'EMPTY', level: 10 } } as const

export function hopper(status: FeederStatus | undefined): { label: string; level: number; stale: boolean } | undefined {
  const reading = status?.foodStorage
  if (!reading) return undefined
  const known = HOPPER[reading.value as keyof typeof HOPPER]
  return { label: known?.label ?? reading.value.toUpperCase(), level: known?.level ?? 0, stale: Date.now() - new Date(reading.at).getTime() > STALE_AFTER_MS }
}

export function lastFed(status: FeederStatus | undefined): string {
  const last = status?.lastFeed
  if (!last) return '—'
  const date = new Date(last.at)
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const when = date.toDateString() === new Date().toDateString() ? time : `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${time}`
  return last.portions === 0 ? `${when} · FAILED` : `${when} · ${last.portions} PORTION${last.portions > 1 ? 'S' : ''}`
}
