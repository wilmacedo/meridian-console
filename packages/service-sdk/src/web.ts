import type { Component } from 'svelte'
import type { ServiceSummary } from './index.js'

export interface ServiceViewProps {
  service: ServiceSummary
}

export interface WebService {
  // Full-page UI shown when the service is selected, below the shell's breadcrumb. Without one, the
  // generic panel (manifest, status and facts) is used.
  panel?: Component<ServiceViewProps>
  // Self-contained widgets (they fetch their own data) rendered on the Habitat screen, in order.
  habitat?: Component<Record<string, never>>[]
}

export const defineWebService = (service: WebService): WebService => service
