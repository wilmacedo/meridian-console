import type { ServiceActionInfo } from '@meridian/service-sdk'
import { kick } from '../agent/agent-state.svelte'

export interface ActionResult {
  pending: boolean
  status?: number
  ms?: number
}

// Last result per "<service>/<action>", for the RUN buttons.
export const results = $state<Record<string, ActionResult>>({})

export const keyOf = (serviceId: string, action: ServiceActionInfo): string => `${serviceId}/${action.id}`

export async function runAction(serviceId: string, action: ServiceActionInfo): Promise<void> {
  const key = keyOf(serviceId, action)
  results[key] = { pending: true }
  kick(0.6)
  try {
    const res = await fetch(`/api/services/${serviceId}/actions/${action.id}`, { method: 'POST' })
    const body = (await res.json()) as { ms?: number }
    results[key] = { pending: false, status: res.status, ms: body.ms }
  } catch {
    results[key] = { pending: false, status: 0 }
  }
}
