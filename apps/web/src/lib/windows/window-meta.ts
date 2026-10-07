import { MODULES } from '../modules'
import type { WindowId } from './window-manager.svelte'

export interface WindowMeta {
  index: string
  title: string
  kicker: string
}

export interface MetaContext {
  hostName: string
  doc: { title: string; kicker: string } | null
}

const KICKERS: Record<string, (ctx: MetaContext) => string> = {
  services: () => 'Launcher',
  telemetry: ({ hostName }) => `${hostName.toLowerCase()} · live`,
  logs: () => 'Unified log stream',
  cameras: () => 'Feeds · linked automation',
}

export function windowMeta(id: WindowId, ctx: MetaContext): WindowMeta {
  if (id === 'doc') return { index: 'NX', title: ctx.doc?.title ?? 'Document', kicker: ctx.doc?.kicker ?? '' }
  const at = MODULES.findIndex((m) => m.id === id)
  return { index: String(at + 1).padStart(2, '0'), title: MODULES[at].label, kicker: KICKERS[id]?.(ctx) ?? '' }
}
