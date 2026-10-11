// Checks for the JSON NOX sends. The message of a thrown error is what NOX reads to fix its call, so it names
// the field by its path.

export const fail = (message: string): never => {
  throw new Error(message)
}

export function object(raw: unknown, path: string, allowed: readonly string[]): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail(`${path} must be an object`)
  const unknown = Object.keys(raw).filter((k) => !allowed.includes(k))
  if (unknown.length) fail(`${path}: unknown field${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}`)
  return raw as Record<string, unknown>
}

export function text(raw: Record<string, unknown>, key: string, path: string, max: number): string {
  const v = raw[key]
  if (typeof v !== 'string' || !v.trim()) return fail(`${path}.${key} is required`)
  if (v.length > max) fail(`${path}.${key} is longer than ${max} characters`)
  return v.trim()
}

export function list(raw: Record<string, unknown>, key: string, path: string, min: number, max: number): unknown[] {
  const v = raw[key]
  if (!Array.isArray(v)) return fail(`${path}.${key} must be a list`)
  if (v.length < min || v.length > max) fail(`${path}.${key} must have ${min} to ${max} items`)
  return v
}
