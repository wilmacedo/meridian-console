import type { Component } from 'svelte'

// Contributions are self-contained: they fetch their own data from /api/services/<id>/... and import
// nothing from apps/web.
type Contribution = Component<Record<string, never>>

export interface ServiceWindow {
  // Unique within the service.
  id: string
  title: string
  kicker: string
  // A window with a module is what that dock button opens. Several services can contribute to one
  // module; their bodies stack in a single window.
  module?: 'cameras' | 'calendar'
  // The widget type this window's PIN button docks, if any.
  pin?: string
  // Left side of the window footer; a function is read on every render, so it can follow live data.
  footer?: string | (() => string)
  component: Contribution
}

export type WidgetTone = 'ok' | 'warn' | 'bad'

// What a widget shows as one tile of the car layout: a glanceable summary instead of its card.
export interface WidgetTile {
  // Short, shown in capitals above the value ("NEXT FEED").
  kicker: string
  value: string
  // Prefer `text` for a title or a sentence; `number` is larger.
  valueSize?: 'number' | 'text'
  unit?: string
  sub?: string
  // The dot beside the kicker; `ok` when absent.
  tone?: WidgetTone
  // A CSS colour that replaces the tone's for the dot and the bar (a calendar's own colour).
  accent?: string
  // The sub line takes the tone's colour instead of the muted one.
  subTone?: 'dim' | WidgetTone
  // A thin bar under the sub line, 0 to 100.
  bar?: { value: number; tone?: WidgetTone }
}

export interface ServiceWidget {
  // Stable, so a workspace can persist the widget and recreate it.
  type: string
  title: string
  kicker: string
  component: Contribution
  // The summary the car layout shows for this widget; without it the tile shows the widget's title and kicker.
  tile?: {
    // Starts what feeds the tile (polling, a stream) and returns how to stop it. Called inside an effect, so it
    // may read reactive state and runs again, after stopping, when that changes.
    watch?: () => () => void
    // Read while rendering, so the tile follows the service's own reactive state.
    read: () => WidgetTile
  }
  // The window a tap on the tile opens: a dock module id or one of the service's windows.
  opens?: string
}

export interface WebService {
  windows?: ServiceWindow[]
  widgets?: ServiceWidget[]
}

export const defineWebService = (service: WebService): WebService => service
