import { MODULES, type ModuleId } from '../modules'

export const STRANDS_MIN = 16
export const STRANDS_MAX = 80
export const STRANDS_STEP = 4
export const STRANDS_DEFAULT = 32

// A stored order that misses a module (one added since) or names one that is gone still yields every module once.
export function sanitizeModuleOrder(stored: unknown): ModuleId[] {
  const known = MODULES.map((m) => m.id)
  const kept = Array.isArray(stored) ? stored.filter((id, i, all): id is ModuleId => known.includes(id) && all.indexOf(id) === i) : []
  return [...kept, ...known.filter((id) => !kept.includes(id))]
}

export const clampStrands = (n: number): number => Math.min(STRANDS_MAX, Math.max(STRANDS_MIN, Math.round(n / STRANDS_STEP) * STRANDS_STEP))
