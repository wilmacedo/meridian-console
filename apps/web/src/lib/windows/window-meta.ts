import { MODULES } from '../modules'
import { contributedWindow } from '../services/service-ui'
import type { WindowId } from './window-manager.svelte'

export interface WindowMeta {
  index: string
  title: string
  kicker: string
}

export interface MetaContext {
  hostName: string
  doc: { title: string; kicker: string } | null
  // Two-letter badge of a service, for the windows it contributes.
  monoOf: (serviceId: string) => string
}

const KICKERS: Record<string, (ctx: MetaContext) => string> = {
  services: () => 'Launcher',
  telemetry: ({ hostName }) => `${hostName.toLowerCase()} · live`,
  logs: () => 'Unified log stream',
  cameras: () => 'Feeds · linked automation',
}

export function windowMeta(id: WindowId, ctx: MetaContext): WindowMeta {
  if (id === 'settings') return { index: 'ST', title: 'Settings', kicker: 'This workspace · autosave' }
  if (id === 'doc') return { index: 'NX', title: ctx.doc?.title ?? 'Document', kicker: ctx.doc?.kicker ?? '' }
  const own = contributedWindow(id)
  if (own) return { index: ctx.monoOf(own.serviceId), title: own.title, kicker: own.kicker }
  const at = MODULES.findIndex((m) => m.id === id)
  return { index: String(at + 1).padStart(2, '0'), title: MODULES[at].label, kicker: KICKERS[id]?.(ctx) ?? '' }
}
