import { docs } from '../docs/docs.svelte'
import { eventsView } from '../live/events-view.svelte'
import { contributedWidget, contributedWindow, moduleContributions } from '../services/service-ui'
import type { WindowId } from '../windows/window-manager.svelte'
import { docWidget, logs, serviceWidget, services, tele, type WidgetDef } from './widgets'

function contributed(type: string | undefined): WidgetDef | null {
  const w = type ? contributedWidget(type) : undefined
  return w ? serviceWidget(w.type, w.title, w.kicker) : null
}

// The widget a window's PIN button docks.
export function pinDef(id: WindowId): WidgetDef | null {
  switch (id) {
    case 'services':
      return services()
    case 'telemetry':
      return tele()
    case 'logs':
      return logs(eventsView.filter)
    case 'cameras':
      return contributed(moduleContributions('cameras').find((w) => w.pin)?.pin)
    case 'doc':
      return docs.current ? docWidget(docs.current.title, docs.current.blocks) : null
    default:
      return contributed(contributedWindow(id)?.pin)
  }
}
