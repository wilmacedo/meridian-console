// Fills `{{path}}` placeholders in a block template with the result of a service action, so a live widget
// can redraw itself from fresh data. A path is dotted (`lastFeed.at`, `items.0.name`). A string that is
// only one placeholder keeps the value's type (a progress bar needs a number); a placeholder inside
// other text is written as text. A path that leads nowhere reads as an em dash.
const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}/g
const WHOLE = /^\{\{\s*([\w.-]+)\s*\}\}$/
const MISSING = '—'

function lookup(data: unknown, path: string): unknown {
  let at = data
  for (const key of path.split('.')) {
    if (at === null || typeof at !== 'object') return undefined
    at = (at as Record<string, unknown>)[key]
  }
  return at
}

function fill(node: unknown, data: unknown): unknown {
  if (typeof node === 'string') {
    const whole = WHOLE.exec(node)
    if (whole) return lookup(data, whole[1]) ?? MISSING
    return node.replace(PLACEHOLDER, (_m, path: string) => {
      const v = lookup(data, path)
      return v === undefined || v === null ? MISSING : typeof v === 'object' ? JSON.stringify(v) : String(v)
    })
  }
  if (Array.isArray(node)) return node.map((n) => fill(n, data))
  if (node !== null && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fill(v, data)]))
  return node
}

export function renderTemplate<T>(template: T, data: unknown): T {
  return fill(template, data) as T
}
