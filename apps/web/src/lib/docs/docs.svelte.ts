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

// Shows a document in its window, streaming it in block by block while NOX "composes" it.
export function openDoc(spec: DocSpec): void {
  clearInterval(timer)
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
