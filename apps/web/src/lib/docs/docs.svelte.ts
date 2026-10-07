import { kick } from '../agent/agent-state.svelte'
import { dock } from '../dock/dock.svelte'
import { open } from '../windows/window-manager.svelte'
import type { DocSpec } from './doc-blocks'

const BLOCK_INTERVAL_MS = 260

export const docs = $state({
  current: null as DocSpec | null,
  // How many blocks have streamed in so far.
  shown: 0,
})

let timer: ReturnType<typeof setInterval> | undefined

// Shows a document in its window, streaming it in block by block while NOX "composes" it. A live
// document (same id as the one on screen) is updated where it is: no animation, and its window is left as
// the owner has it, so a task reporting progress doesn't pull a closed window back open.
export function openDoc(spec: DocSpec): void {
  clearInterval(timer)
  if (spec.id && docs.current?.id === spec.id) {
    docs.current = spec
    docs.shown = spec.blocks.length
    return
  }
  kick(1)
  docs.current = spec
  docs.shown = 0
  open('doc')
  timer = setInterval(() => {
    docs.shown++
    if (docs.shown >= spec.blocks.length) clearInterval(timer)
  }, BLOCK_INTERVAL_MS)
}

// A document that was already on screen when the workspace was saved shows whole, not streamed in again.
export function restoreDoc(spec: DocSpec | null): void {
  clearInterval(timer)
  docs.current = spec
  docs.shown = spec?.blocks.length ?? 0
}

if (import.meta.env.DEV) Object.assign(window, { noxDocs: { openDoc } })

// A document NOX composed. Widgets docked from a live document follow it wherever it is; if the owner has
// docked one, they are watching it there, so an update doesn't pull the document window open.
export function composeDoc(spec: DocSpec): void {
  const bound = spec.id ? Object.values(dock.widgets).filter((w) => w.def.docId === spec.id) : []
  for (const w of bound) {
    w.def.title = spec.title
    w.def.blocks = spec.blocks
  }
  if (bound.length > 0 && docs.current?.id !== spec.id) return
  openDoc(spec)
}

// Opens a live document by id, whether or not this screen saw it composed (the server keeps the latest).
export async function showDoc(id: string): Promise<void> {
  if (docs.current?.id === id) return void open('doc')
  const res = await fetch(`/api/docs/${encodeURIComponent(id)}`)
  if (res.ok) openDoc((await res.json()) as DocSpec)
}
