import type { WorkspaceSummary } from '@meridian/service-sdk'

export const NAME_MAX = 60

// The reason a name cannot be used for a new workspace, or undefined when it can. The server has the last word
// (it also refuses a name that would make the id of another one).
export function nameProblem(name: string, existing: WorkspaceSummary[]): string | undefined {
  const trimmed = name.trim()
  if (!trimmed) return 'NAME IT'
  if (existing.some((w) => w.name.toLowerCase() === trimmed.toLowerCase())) return 'ALREADY EXISTS'
  return undefined
}
