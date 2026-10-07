import type { LiveWidgetSpec } from '@meridian/service-sdk'
import type { DocBlock } from '../docs/doc-blocks'

export type RailId = 'L' | 'R'
// Built-in types, or one contributed by a service.
export type WidgetType = 'tele' | 'services' | 'logs' | 'doc' | 'bound' | (string & {})

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
  // A doc widget made from a live document: it follows that document as NOX updates it.
  docId?: string
  // A widget that redraws itself from a read-only service action.
  bind?: LiveWidgetSpec
}

export const tele = (): WidgetDef => ({ type: 'tele', src: 'sys', title: 'Telemetry', kicker: 'HOST · LIVE' })
export const services = (): WidgetDef => ({ type: 'services', src: 'sys', title: 'Services', kicker: 'LAUNCHER · LIVE' })
export const logs = (svc: string): WidgetDef => ({
  type: 'logs',
  src: 'sys',
  svc,
  title: svc === 'all' ? 'Events' : svc,
  kicker: svc === 'all' ? 'UNIFIED LOGS · LIVE' : 'LOGS · LIVE',
})
export const docWidget = (title: string, blocks: DocBlock[], docId?: string): WidgetDef => ({ type: 'doc', src: 'agent', title, kicker: 'COMPOSED BY NOX', blocks, docId })
export const boundWidget = (bind: LiveWidgetSpec): WidgetDef => ({ type: 'bound', src: 'agent', title: bind.title, kicker: bind.kicker, bind })

export const serviceWidget = (type: string, title: string, kicker: string): WidgetDef => ({ type, src: 'sys', title, kicker })
