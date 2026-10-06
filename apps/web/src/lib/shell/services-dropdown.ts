import type { ServiceSummary } from '@meridian/service-sdk'

export interface ServiceGroup {
  host: string
  items: ServiceSummary[]
}

// Grouped by the host each service declares, filtered on name + kind + tag + host — see
// docs/design-handoff.md#screen-2--services-dropdown-overlay-not-a-route.
export function filterServiceGroups(services: ServiceSummary[], query: string): ServiceGroup[] {
  const q = query.trim().toLowerCase()
  return [...new Set(services.map((sv) => sv.host))]
    .map((host) => ({
      host,
      items: services.filter(
        (sv) => sv.host === host && (!q || `${sv.name}${sv.kind}${sv.tag}${sv.host}`.toLowerCase().includes(q)),
      ),
    }))
    .filter((group) => group.items.length > 0)
}
