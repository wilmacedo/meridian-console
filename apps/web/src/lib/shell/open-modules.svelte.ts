import { kick } from '../agent/agent-state.svelte'
import type { ModuleId } from '../modules'

const MAX_WINDOWS = 4

// Stand-in until the window manager exists: it tracks which modules are open (last = active) so the
// dock and the orb already behave as designed.
export const openModules = $state({ ids: [] as ModuleId[] })

export function openModule(id: ModuleId): void {
  if (id === 'core') {
    if (openModules.ids.length) kick(0.5)
    openModules.ids = []
    return
  }
  const rest = openModules.ids.filter((x) => x !== id)
  const isNew = rest.length === openModules.ids.length
  openModules.ids = [...rest, id].slice(-MAX_WINDOWS)
  if (isNew) kick(1)
}

export function closeActiveModule(): void {
  if (openModules.ids.length) openModules.ids = openModules.ids.slice(0, -1)
}
