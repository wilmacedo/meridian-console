import { kick } from '../agent/agent-state.svelte'
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
