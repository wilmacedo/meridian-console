import type { ServiceSummary } from '@meridian/service-sdk'
import { live } from '../live/stream.svelte'

// Settings that belong to the workspace but aren't layout: what the screen chooses to show.
export const prefs = $state({
  // Retired services are kept out of the Services window and the counts.
  hiddenServices: [] as string[],
})

export const isHidden = (id: string): boolean => prefs.hiddenServices.includes(id)

export function toggleHidden(id: string): void {
  prefs.hiddenServices = isHidden(id) ? prefs.hiddenServices.filter((x) => x !== id) : [...prefs.hiddenServices, id]
}

export const visibleServices = (): ServiceSummary[] => live.services.filter((s) => !isHidden(s.id))
