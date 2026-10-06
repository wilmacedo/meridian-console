import type { ServiceSummary } from '@meridian/service-sdk'
import { appState } from '../state/app-state.svelte'
import { registry } from './registry.svelte'

export function selectedService(): ServiceSummary | undefined {
  return registry.services.find((s) => s.id === appState.svcId) ?? registry.services[0]
}
