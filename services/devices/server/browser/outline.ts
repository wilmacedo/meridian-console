import type { ElementFacts } from './risk.js'

// The extension's page outline is written for a program that has tokens to burn. NOX does not, so the text is
// cleaned before it is returned: no CSS annotations, no text printed twice, no wrappers with nothing inside.

interface Node {
  indent: number
  kind: string
  ref?: string
  name?: string
  rest: string
  children: Node[]
}

const LINE = /^(\s*)(?:@(e\d+) )?([A-Za-z][\w-]*)(?: "((?:[^"\\]|\\.)*)")?(.*)$/
const CSS_TOKEN = /\bcss[-_]build[-_:]\S*/g
const CTX = /\s*\[ctx: [^\]]*\]/g
const MAX_NAME = 120
const WRAPPERS = new Set(['group', 'img', 'generic', 'tooltip', 'text', 'StaticText', 'separator', 'presentation'])
const EDITABLE = new Set(['textbox', 'combobox', 'searchbox', 'textarea'])

const tidy = (s: string): string => s.replace(CSS_TOKEN, '').replace(/\s+/g, ' ').trim()

function parse(text: string): { nodes: Node[]; cursor?: string } {
  const root: Node = { indent: -1, kind: 'root', rest: '', children: [] }
  const stack: Node[] = [root]
  let cursor: string | undefined
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue
    const more = /^@more observe --cursor (\S+?);/.exec(raw)
    if (more) {
      cursor = more[1]
      continue
    }
    if (/^@(vom|view|warning)\b/.test(raw) || /^@layers\b/.test(raw)) continue
    const m = LINE.exec(raw.replace(CTX, ''))
    if (!m) continue
    const node: Node = { indent: m[1].length, kind: m[3], ref: m[2], name: m[4] === undefined ? undefined : tidy(m[4]), rest: tidy(m[5]), children: [] }
    while (stack.length > 1 && stack[stack.length - 1].indent >= node.indent) stack.pop()
    stack[stack.length - 1].children.push(node)
    stack.push(node)
  }
  return { nodes: root.children, cursor }
}

const label = (n: Node): string => (n.name ? n.name.slice(0, MAX_NAME) : '')

// Drops what repeats an ancestor's text and what ends up empty; keeps anything NOX can act on.
function prune(nodes: Node[], ancestorTexts: string[]): Node[] {
  const kept: Node[] = []
  for (const n of nodes) {
    const isText = n.kind === 'text' || n.kind === 'StaticText'
    if (isText && ancestorTexts.includes(label(n))) continue
    if (n.kind === 'tooltip') continue
    const children = prune(n.children, n.name ? [...ancestorTexts, label(n)] : ancestorTexts)
    const empty = !n.ref && !n.name && children.length === 0
    if (empty && (WRAPPERS.has(n.kind) || !n.rest)) continue
    if (isText && children.length === 0 && kept.length > 0 && label(kept[kept.length - 1]) === label(n)) continue
    kept.push({ ...n, children })
  }
  return kept
}

function render(nodes: Node[], depth: number, out: string[]): void {
  for (const n of nodes) {
    const ref = n.ref ? `@${n.ref} ` : ''
    const name = n.name ? ` "${label(n)}"` : ''
    out.push(`${'  '.repeat(depth)}${ref}${n.kind}${name}${n.rest ? ` ${n.rest}` : ''}`)
    render(n.children, depth + 1, out)
  }
}

export interface Cleaned {
  text: string
  // Pass back to read to get the rest of the page.
  cursor?: string
}

export function cleanOutline(text: string): Cleaned {
  const { nodes, cursor } = parse(text)
  const out: string[] = []
  render(prune(nodes, []), 0, out)
  return { text: out.join('\n'), cursor }
}

// What each ref in the outline is, so a click can be judged before it happens. Read from the raw outline,
// because pruning removes the form and dialog wrappers that say where a control lives.
export function elementFacts(text: string): Map<string, ElementFacts> {
  const facts = new Map<string, ElementFacts>()
  const stack: { indent: number; kind: string }[] = []
  let modal = false
  for (const raw of text.split('\n')) {
    const layer = /^L\d+ (\w+)/.exec(raw)
    if (layer) {
      modal = layer[1] === 'modal'
      continue
    }
    const m = LINE.exec(raw.replace(CTX, ''))
    if (!m || /^@(vom|view|warning|more|layers)\b/.test(raw)) continue
    const indent = m[1].length
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    const kind = m[3]
    if (m[2]) {
      const inSearch = stack.some((s) => s.kind === 'search') || kind === 'searchbox'
      const inForm = stack.some((s) => s.kind === 'form')
      facts.set(m[2], {
        name: tidy(m[4] ?? ''),
        role: kind,
        type: kind === 'searchbox' ? 'search' : undefined,
        editable: EDITABLE.has(kind),
        inForm,
        formSearch: inSearch,
        // A button inside a form is taken to submit it: asking too often beats missing a submit.
        isSubmit: kind === 'button' && inForm,
        inDialog: modal || stack.some((s) => s.kind === 'dialog' || s.kind === 'alertdialog'),
      })
    }
    stack.push({ indent, kind })
  }
  return facts
}
