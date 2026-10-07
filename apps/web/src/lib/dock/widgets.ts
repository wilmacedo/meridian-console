import type { DocBlock } from '../docs/doc-blocks'

export type RailId = 'L' | 'R'
export type WidgetType = 'tele' | 'feeder' | 'services' | 'logs' | 'doc'

// What a widget is, not how it looks right now: enough to persist it and recreate it with live data.
export interface WidgetDef {
  type: WidgetType
  // sys = a system widget (unique per type and service); agent = made by NOX.
  src: 'sys' | 'agent'
  title: string
  kicker: string
  // For logs: the service whose events it shows, or 'all'.
  svc?: string
  blocks?: DocBlock[]
}

export const tele = (): WidgetDef => ({ type: 'tele', src: 'sys', title: 'Telemetry', kicker: 'HOST · LIVE' })
export const feeder = (): WidgetDef => ({ type: 'feeder', src: 'sys', title: 'Feeder', kicker: 'AUTOMATION · LIVE' })
export const services = (): WidgetDef => ({ type: 'services', src: 'sys', title: 'Services', kicker: 'LAUNCHER · LIVE' })
export const logs = (svc: string): WidgetDef => ({
  type: 'logs',
  src: 'sys',
  svc,
  title: svc === 'all' ? 'Events' : svc,
  kicker: svc === 'all' ? 'UNIFIED LOGS · LIVE' : 'LOGS · LIVE',
})
export const docWidget = (title: string, blocks: DocBlock[]): WidgetDef => ({ type: 'doc', src: 'agent', title, kicker: 'COMPOSED BY NOX', blocks })
