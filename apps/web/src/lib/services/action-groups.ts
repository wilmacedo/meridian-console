import type { ServiceActionInfo } from '@meridian/service-sdk'

export interface ActionGroup {
  // The path's first segment ("browser" for /browser/open); '' for the rest.
  id: string
  label: string
  actions: ServiceActionInfo[]
}

export const GENERAL = 'General'

const segmentOf = (path: string): string => {
  const parts = path.split('/').filter(Boolean)
  return parts.length > 1 ? parts[0] : ''
}

// Groups by the path's first segment, in order of first appearance, with the ungrouped first. A segment only
// one action uses is no group: a heading over one row says nothing the row doesn't.
export function groupActions(actions: readonly ServiceActionInfo[]): ActionGroup[] {
  const bySegment = new Map<string, ServiceActionInfo[]>([['', []]])
  for (const a of actions) {
    const key = segmentOf(a.path)
    bySegment.set(key, [...(bySegment.get(key) ?? []), a])
  }
  const general = bySegment.get('')!
  const groups: ActionGroup[] = []
  for (const [id, list] of bySegment) {
    if (id === '') continue
    if (list.length === 1) general.push(list[0])
    else groups.push({ id, label: id.replace(/[-_]/g, ' '), actions: list })
  }
  return general.length ? [{ id: '', label: GENERAL, actions: actions.filter((a) => general.includes(a)) }, ...groups] : groups
}

// Every word of the query must appear in the action's path, title, description or id.
export function matchesQuery(action: ServiceActionInfo, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const hay = `${action.path} ${action.title} ${action.description} ${action.id}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

export interface InputField {
  name: string
  type: string
  required: boolean
  description?: string
}

// The top-level fields of an action's JSON Schema input, for reading, not for validating.
export function inputFields(schema: Record<string, unknown> | undefined): InputField[] {
  const props = schema?.properties
  if (!props || typeof props !== 'object') return []
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : []
  return Object.entries(props as Record<string, Record<string, unknown>>).map(([name, p]) => ({
    name,
    type: Array.isArray(p.enum) ? p.enum.map(String).join(' | ') : typeof p.type === 'string' ? p.type : Array.isArray(p.type) ? p.type.join(' | ') : 'any',
    required: required.includes(name),
    description: typeof p.description === 'string' ? p.description : undefined,
  }))
}
