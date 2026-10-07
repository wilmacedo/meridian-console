import { docs } from '../docs/docs.svelte'
import { eventsView } from '../live/events-view.svelte'
import type { WindowId } from '../windows/window-manager.svelte'
import { docWidget, feeder, logs, services, tele, type WidgetDef } from './widgets'

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
      return feeder()
    case 'doc':
      return docs.current ? docWidget(docs.current.title, docs.current.blocks) : null
  }
}
