import { infraNodes } from '../data/infra'
import { services, type Service } from '../data/services'

export interface ServiceGroup {
  host: string
  items: Service[]
}

// Grouped by the same core infra hosts the System Overview graph uses, filtered on name + kind +
// tag + host — see docs/design-handoff.md#screen-2--services-dropdown-overlay-not-a-route.
export function filterServiceGroups(query: string): ServiceGroup[] {
  const q = query.trim().toLowerCase()
  return infraNodes
    .filter((node) => node.kind === 'core' && services.some((sv) => sv.host === node.id))
    .map((node) => ({
      host: node.name,
      items: services.filter(
        (sv) => sv.host === node.id && (!q || `${sv.name}${sv.kind}${sv.tag}${sv.host}`.toLowerCase().includes(q)),
      ),
    }))
    .filter((group) => group.items.length > 0)
}
