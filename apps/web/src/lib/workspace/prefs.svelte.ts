import type { ServiceSummary } from '@meridian/service-sdk'
import { live } from '../live/stream.svelte'
import { MODULES, type ModuleDef, type ModuleId } from '../modules'
import { sanitizeModuleOrder } from './module-order'

// Settings that belong to the workspace but aren't layout: what the screen chooses to show.
export const prefs = $state({
  // Retired services are kept out of the Services window and the counts.
  hiddenServices: [] as string[],
  // Dock modules taken off the dock (Core always stays).
  hiddenModules: [] as string[],
  // The core's background measurement grid.
  grid: true,
  // Density of the orb's strands.
  strands: 32,
  // The dock order, which is also what the 1-9 shortcuts count.
  moduleOrder: MODULES.map((m) => m.id) as ModuleId[],
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

// Every module in dock order, hidden ones included (the settings list).
export const orderedModules = (): readonly ModuleDef[] => prefs.moduleOrder.map((id) => MODULES.find((m) => m.id === id)).filter((m): m is ModuleDef => m !== undefined)

// The modules on the dock, in dock order; also what the 1-9 shortcuts count.
export const visibleModules = (): readonly ModuleDef[] => orderedModules().filter((m) => !isModuleHidden(m.id))

export function moveModule(id: ModuleId, by: -1 | 1): void {
  const order = [...prefs.moduleOrder]
  const at = order.indexOf(id)
  const to = at + by
  if (at < 0 || to < 0 || to >= order.length) return
  ;[order[at], order[to]] = [order[to], order[at]]
  prefs.moduleOrder = order
}
