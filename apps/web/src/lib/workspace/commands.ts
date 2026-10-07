import type { ScreenCommand } from '@meridian/service-sdk'
import { clearAgentWidgets, requestPin } from '../dock/dock.svelte'
import { boundWidget } from '../dock/widgets'
import { pinDef } from '../dock/pin'
import { composeDoc } from '../docs/docs.svelte'
import { MODULES } from '../modules'
import { contributedWindow } from '../services/service-ui'
import { theme } from '../theme/theme.svelte'
import { arrange, close, closeAll, open } from '../windows/window-manager.svelte'

// A window the screen can actually show: a dock module (the server says "logs" for Events) or one a
// service contributes.
const isKnownWindow = (id: string): boolean => (id !== 'core' && MODULES.some((m) => m.id === id)) || id === 'doc' || contributedWindow(id) !== undefined

// What the server asks this screen to do (NOX's tools). The resulting layout reaches the other
// screens through the workspace, like any change made by hand.
export function runCommand(command: ScreenCommand): void {
  switch (command.name) {
    case 'open_window':
      if (isKnownWindow(command.window)) open(command.window)
      break
    case 'close_window':
      close(command.window)
      break
    case 'close_all':
      closeAll()
      break
    case 'arrange':
      arrange()
      break
    case 'pin_widget': {
      const def = isKnownWindow(command.window) ? pinDef(command.window) : null
      if (def) requestPin(def)
      break
    }
    case 'clear_agent_widgets':
      clearAgentWidgets()
      break
    case 'set_theme':
      if (command.mode) theme.mode = command.mode
      if (command.palette) theme.palette = command.palette
      break
    case 'compose_doc':
      composeDoc(command.doc)
      break
    case 'pin_live_widget':
      requestPin(boundWidget(command.widget))
      break
  }
}
