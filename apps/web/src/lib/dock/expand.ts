import { docs, openDoc } from '../docs/docs.svelte'
import { eventsView } from '../live/events-view.svelte'
import { contributedWidget, windowPinning } from '../services/service-ui'
import { open } from '../windows/window-manager.svelte'
import { closeWidget, dock } from './dock.svelte'
import type { WidgetDef } from './widgets'

const BUILT_IN_WINDOW: Record<string, string> = { tele: 'telemetry', services: 'services', logs: 'logs' }

// Opens the window a widget stands for: the one it was pinned from, or for NOX's widgets the document they
// show. False when there is none.
export function openWidgetWindow(def: WidgetDef): boolean {
  if (def.type === 'bound' && def.bind) {
    openDoc({ title: def.bind.title, kicker: def.bind.kicker, blocks: [], bind: def.bind })
    return true
  }
  if (def.type === 'doc' && def.blocks) {
    // The live document still on screen keeps its own kicker; the widget only has "composed by NOX".
    if (def.docId && docs.current?.id === def.docId) open('doc')
    else openDoc({ id: def.docId, title: def.title, kicker: def.kicker, blocks: def.blocks })
    return true
  }
  const target = BUILT_IN_WINDOW[def.type] ?? contributedWidget(def.type)?.opens ?? windowPinning(def.type)
  if (!target) return false
  if (def.type === 'logs') eventsView.filter = def.svc ?? 'all'
  open(target)
  return true
}

// Takes a widget off the dock and back to a window.
export function expandWidget(id: string): void {
  const w = dock.widgets[id]
  if (w && !w.closing && openWidgetWindow(w.def)) closeWidget(id)
}
