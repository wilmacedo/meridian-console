import { startListening } from '../agent/agent-state.svelte'
import { MODULES } from '../modules'
import { closeActiveModule, openModule } from './open-modules.svelte'

// Esc closes an open overlay (settings menu, pending pin) before it closes a window.
export function handleShortcut(e: KeyboardEvent, closeOverlay: () => boolean): void {
  if (e.key === ' ') {
    e.preventDefault()
    startListening()
  } else if (e.key === 'Escape') {
    if (!closeOverlay()) closeActiveModule()
  } else if (/^[1-9]$/.test(e.key)) {
    const m = MODULES[Number(e.key) - 1]
    if (m) openModule(m.id)
  }
}
