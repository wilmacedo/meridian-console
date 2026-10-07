import type { DocBlock, DocSpec } from './doc-blocks'

const MAX_ROWS = 50
const MAX_COLS = 8
const MAX_CODE_CHARS = 8000

type Primitive = string | number | boolean | null

// One id per service and action, so running it again updates the document where it is.
export const resultDocId = (service: string, action: string): string => `result-${service}-${action}`

const isPrimitive = (v: unknown): v is Primitive => v === null || ['string', 'number', 'boolean'].includes(typeof v)
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const show = (v: unknown): string => (v === null || v === undefined ? '—' : String(v))
const json = (v: unknown): string => {
  const text = JSON.stringify(v, null, 2) ?? String(v)
  return text.length > MAX_CODE_CHARS ? `${text.slice(0, MAX_CODE_CHARS)}\n… truncated` : text
}

// What a read-only action returned, as the blocks that read best: key/value for a flat object, a table for a
// list of flat objects, JSON for anything else.
export function resultBlocks(result: unknown, depth = 0): DocBlock[] {
  if (result === null || result === undefined) return [{ t: 'p', text: 'No result.' }]
  if (typeof result === 'string') return result.includes('\n') || result.length > 120 ? [{ t: 'code', text: result.slice(0, MAX_CODE_CHARS) }] : [{ t: 'p', text: result }]
  if (isPrimitive(result)) return [{ t: 'p', text: String(result) }]

  if (Array.isArray(result)) {
    if (result.length === 0) return [{ t: 'p', text: 'Empty list.' }]
    if (result.every((r) => isRecord(r) && Object.values(r).every(isPrimitive))) {
      const keys = [...new Set(result.flatMap((r) => Object.keys(r as object)))].slice(0, MAX_COLS)
      const rows = (result as Record<string, Primitive>[]).slice(0, MAX_ROWS).map((r) => keys.map((k) => show(r[k])))
      const more = result.length - rows.length
      return [{ t: 'table', cols: keys.map((label) => ({ label })), rows }, ...(more > 0 ? [{ t: 'p' as const, text: `${more} more not shown.` }] : [])]
    }
    return [{ t: 'code', lang: 'json', text: json(result) }]
  }

  const entries = Object.entries(result)
  if (entries.length === 0) return [{ t: 'p', text: 'Empty object.' }]
  const flat = entries.filter(([, v]) => isPrimitive(v))
  const nested = entries.filter(([, v]) => !isPrimitive(v))
  const blocks: DocBlock[] = flat.length ? [{ t: 'kv', items: flat.map(([k, v]) => ({ k, v: show(v) })) }] : []
  for (const [k, v] of nested) blocks.push({ t: 'h', level: 2, text: k }, ...(depth < 1 ? resultBlocks(v, depth + 1) : [{ t: 'code' as const, lang: 'json', text: json(v) }]))
  return blocks
}

export function resultDoc(serviceId: string, serviceName: string, action: { id: string; title: string; method: string; path: string }, blocks: DocBlock[]): DocSpec {
  return { id: resultDocId(serviceId, action.id), title: `${serviceName} · ${action.title}`, kicker: `RESULT · ${action.method} ${action.path}`, blocks }
}
