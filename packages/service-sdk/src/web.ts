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

export interface ServiceWidget {
  // Stable, so a workspace can persist the widget and recreate it.
  type: string
  title: string
  kicker: string
  component: Contribution
}

export interface WebService {
  windows?: ServiceWindow[]
  widgets?: ServiceWidget[]
}

export const defineWebService = (service: WebService): WebService => service
