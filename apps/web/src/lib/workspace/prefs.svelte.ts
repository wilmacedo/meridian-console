import type { ServiceSummary } from '@meridian/service-sdk'
import { live } from '../live/stream.svelte'
import { MODULES, type ModuleDef, type ModuleId } from '../modules'

// Settings that belong to the workspace but aren't layout: what the screen chooses to show.
export const prefs = $state({
  // Retired services are kept out of the Services window and the counts.
  hiddenServices: [] as string[],
  // Dock modules taken off the dock (Core always stays).
  hiddenModules: [] as string[],
})

export const isHidden = (id: string): boolean => prefs.hiddenServices.includes(id)

export function toggleHidden(id: string): void {
  prefs.hiddenServices = isHidden(id) ? prefs.hiddenServices.filter((x) => x !== id) : [...prefs.hiddenServices, id]
}

export const visibleServices = (): ServiceSummary[] => live.services.filter((s) => !isHidden(s.id))

export const isModuleHidden = (id: ModuleId): boolean => prefs.hiddenModules.includes(id)

export function toggleModuleHidden(id: ModuleId): void {
  if (id === 'core') return
  prefs.hiddenModules = isModuleHidden(id) ? prefs.hiddenModules.filter((x) => x !== id) : [...prefs.hiddenModules, id]
}

// The modules on the dock, in dock order; also what the 1-9 shortcuts count.
export const visibleModules = (): readonly ModuleDef[] => MODULES.filter((m) => !isModuleHidden(m.id))
