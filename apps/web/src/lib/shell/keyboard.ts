import { toggleListening } from '../voice/microphone.svelte'
import { visibleModules } from '../workspace/prefs.svelte'
import { closeActive, openModule } from '../windows/window-manager.svelte'

// Esc closes an open overlay (settings menu, pending pin) before it closes a window.
export function handleShortcut(e: KeyboardEvent, closeOverlay: () => boolean): void {
  if (e.key === ' ') {
    e.preventDefault()
    void toggleListening()
  } else if (e.key === 'Escape') {
    if (!closeOverlay()) closeActive()
  } else if (/^[1-9]$/.test(e.key)) {
    const m = visibleModules()[Number(e.key) - 1]
    if (m) openModule(m.id)
  }
}
