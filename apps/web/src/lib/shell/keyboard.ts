import { toggleListening } from '../voice/microphone.svelte'
import { visibleModules } from '../workspace/prefs.svelte'
import { switchWorkspace, workspaces } from '../workspace/workspace-sync.svelte'
import { closeActive, openModule } from '../windows/window-manager.svelte'
import { shellUi } from './shell-ui.svelte'

// Esc closes an open overlay (settings menu, pending pin) before it closes a window.
export function handleShortcut(e: KeyboardEvent, closeOverlay: () => boolean): void {
  // Typing in a field is not a shortcut (a space or a digit in a name); only Esc still gets out.
  if (e.key !== 'Escape' && (e.target as Element | null)?.closest?.('input, textarea')) return
  if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
    e.preventDefault()
    const w = workspaces.list[Number(e.code.slice(5)) - 1]
    if (w) void switchWorkspace(w.id)
  } else if (e.metaKey || e.ctrlKey || e.altKey) {
    return
  } else if (e.key === ' ') {
    e.preventDefault()
    void toggleListening()
  } else if (e.key === 'Escape') {
    if (!closeOverlay()) closeActive()
  } else if (e.key === 'w' || e.key === 'W') {
    shellUi.settingsOpen = false
    shellUi.workspacesOpen = !shellUi.workspacesOpen
  } else if (/^[1-9]$/.test(e.key)) {
    const m = visibleModules()[Number(e.key) - 1]
    if (m) openModule(m.id)
  }
}
