import type { DocBlock, DocSpec, Tone } from '@meridian/service-sdk'

const TONES = ['ok', 'warn', 'bad', 'accent', 'fg', 'dim'] as const
const MAX_BLOCKS = 60
const MAX_TEXT = 4000

type Obj = Record<string, unknown>

const fail = (path: string, message: string): never => {
  throw new Error(`${path}: ${message}`)
}

const obj = (v: unknown, path: string): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : fail(path, 'expected an object'))
const arr = (v: unknown, path: string): unknown[] => (Array.isArray(v) ? v : fail(path, 'expected an array'))

const str = (v: unknown, path: string): string => {
  if (typeof v !== 'string') return fail(path, 'expected a string')
  return v.length <= MAX_TEXT ? v : fail(path, `longer than ${MAX_TEXT} characters`)
}

const optStr = (v: unknown, path: string): string | undefined => (v === undefined ? undefined : str(v, path))

const num = (v: unknown, path: string): number => (typeof v === 'number' && Number.isFinite(v) ? v : fail(path, 'expected a number'))

const oneOf = <T extends string | number>(v: unknown, allowed: readonly T[], path: string): T | undefined => {
  if (v === undefined) return undefined
  return allowed.includes(v as T) ? (v as T) : fail(path, `must be ${allowed.join(', ')}`)
}

const tone = (v: unknown, path: string): Tone | undefined => oneOf(v, TONES, path)

function block(raw: unknown, path: string): DocBlock {
  const b = obj(raw, path)
  const items = (key = 'items'): Obj[] => arr(b[key], `${path}.${key}`).map((x, i) => obj(x, `${path}.${key}[${i}]`))
  switch (b.t) {
    case 'h': {
      const level = oneOf(b.level, [1, 2] as const, `${path}.level`)
      return { t: 'h', text: str(b.text, `${path}.text`), level, eyebrow: optStr(b.eyebrow, `${path}.eyebrow`) }
    }
    case 'p':
      return { t: 'p', text: str(b.text, `${path}.text`) }
    case 'stats':
      return {
        t: 'stats',
        items: items().map((s, i) => ({
          label: str(s.label, `${path}.items[${i}].label`),
          value: typeof s.value === 'number' ? s.value : str(s.value, `${path}.items[${i}].value`),
          unit: optStr(s.unit, `${path}.items[${i}].unit`),
          note: optStr(s.note, `${path}.items[${i}].note`),
          tone: tone(s.tone, `${path}.items[${i}].tone`),
        })),
      }
    case 'progress':
      return {
        t: 'progress',
        items: items().map((p, i) => ({ label: str(p.label, `${path}.items[${i}].label`), value: num(p.value, `${path}.items[${i}].value`), detail: optStr(p.detail, `${path}.items[${i}].detail`), tone: tone(p.tone, `${path}.items[${i}].tone`) })),
      }
    case 'table': {
      const cols = items('cols').map((c, i) => {
        const align = oneOf(c.align, ['left', 'right'] as const, `${path}.cols[${i}].align`)
        return { label: str(c.label, `${path}.cols[${i}].label`), align, w: optStr(c.w, `${path}.cols[${i}].w`) }
      })
      const rows = arr(b.rows, `${path}.rows`).map((row, r) =>
        arr(row, `${path}.rows[${r}]`).map((cell, c) => {
          if (typeof cell === 'string') return cell
          const o = obj(cell, `${path}.rows[${r}][${c}]`)
          return { v: str(o.v, `${path}.rows[${r}][${c}].v`), tone: tone(o.tone, `${path}.rows[${r}][${c}].tone`) }
        }),
      )
      return { t: 'table', cols, rows }
    }
    case 'list':
      return {
        t: 'list',
        items: items().map((l, i) => {
          const state = oneOf(l.state, ['done', 'active', 'todo'] as const, `${path}.items[${i}].state`)
          return { text: str(l.text, `${path}.items[${i}].text`), meta: optStr(l.meta, `${path}.items[${i}].meta`), state }
        }),
      }
    case 'callout':
      return { t: 'callout', text: str(b.text, `${path}.text`), title: optStr(b.title, `${path}.title`), tone: tone(b.tone, `${path}.tone`) }
    case 'kv':
      return { t: 'kv', items: items().map((r, i) => ({ k: str(r.k, `${path}.items[${i}].k`), v: str(r.v, `${path}.items[${i}].v`), tone: tone(r.tone, `${path}.items[${i}].tone`) })) }
    case 'code':
      return { t: 'code', text: str(b.text, `${path}.text`), lang: optStr(b.lang, `${path}.lang`) }
    case 'tags':
      return { t: 'tags', items: items().map((g, i) => ({ label: str(g.label, `${path}.items[${i}].label`), tone: tone(g.tone, `${path}.items[${i}].tone`) })) }
    case 'divider':
      return { t: 'divider' }
    default:
      return fail(`${path}.t`, `unknown block type "${String(b.t)}"; use h, p, stats, progress, table, list, callout, kv, code, tags or divider`)
  }
}

// Checks a document NOX composed and returns it without undefined keys, so the screen can trust it.
// The message of a thrown error is what NOX reads to fix its call.
export function validateDoc(raw: unknown): DocSpec {
  const d = obj(raw, 'doc')
  const blocks = arr(d.blocks, 'blocks')
  if (blocks.length === 0 || blocks.length > MAX_BLOCKS) fail('blocks', `needs between 1 and ${MAX_BLOCKS} blocks`)
  const doc: DocSpec = { title: str(d.title, 'title'), kicker: str(d.kicker ?? '', 'kicker'), blocks: blocks.map((b, i) => block(b, `blocks[${i}]`)) }
  return JSON.parse(JSON.stringify(doc)) as DocSpec
}
