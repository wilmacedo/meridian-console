import type { ServiceSummary } from '@meridian/service-sdk'

const POLL_MS = 15_000

export const registry = $state({
  services: [] as ServiceSummary[],
  loaded: false,
  unreachable: false,
})

let timer: ReturnType<typeof setInterval> | undefined

export async function refreshServices(): Promise<void> {
  try {
    const res = await fetch('/api/services')
    if (!res.ok) throw new Error(`/api/services responded ${res.status}`)
    registry.services = (await res.json()) as ServiceSummary[]
    registry.unreachable = false
  } catch {
    registry.unreachable = true
  } finally {
    registry.loaded = true
  }
}

export function startServicePolling(): void {
  void refreshServices()
  timer = setInterval(refreshServices, POLL_MS)
}

export function stopServicePolling(): void {
  clearInterval(timer)
}
