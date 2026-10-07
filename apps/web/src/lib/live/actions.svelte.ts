import type { ServiceActionInfo } from '@meridian/service-sdk'
import { kick } from '../agent/agent-state.svelte'
import { composeDoc } from '../docs/docs.svelte'
import type { DocBlock } from '../docs/doc-blocks'
import { resultBlocks, resultDoc } from '../docs/result-doc'
import { open } from '../windows/window-manager.svelte'

export interface ActionResult {
  pending: boolean
  status?: number
  ms?: number
}

// Last result per "<service>/<action>", for the RUN buttons.
export const results = $state<Record<string, ActionResult>>({})

export const keyOf = (serviceId: string, action: ServiceActionInfo): string => `${serviceId}/${action.id}`

// A read-only action has nothing to show on its button but a status, so its result (or why it failed) opens in
// the document window, the same one NOX composes into. Actions that change something are left to the button.
export async function runAction(serviceId: string, action: ServiceActionInfo, serviceName = serviceId): Promise<void> {
  const key = keyOf(serviceId, action)
  results[key] = { pending: true }
  kick(0.6)
  try {
    const res = await fetch(`/api/services/${serviceId}/actions/${action.id}`, { method: 'POST' })
    const body = (await res.json()) as { ms?: number; result?: unknown; error?: string }
    results[key] = { pending: false, status: res.status, ms: body.ms }
    if (!action.mutating) {
      const blocks: DocBlock[] = res.ok ? resultBlocks(body.result) : [{ t: 'callout', tone: 'bad', title: `FAILED · ${res.status}`, text: body.error ?? 'The action failed.' }]
      composeDoc(resultDoc(serviceId, serviceName, action, blocks))
      open('doc')
    }
  } catch {
    results[key] = { pending: false, status: 0 }
  }
}
