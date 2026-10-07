import type { Action } from 'svelte/action'

export interface PointerDragOptions {
  // Pointer-downs landing on a match (e.g. a button inside a drag handle) are ignored.
  ignore?: string
  // Movement in px before the gesture counts as a drag; below it, releasing is a plain click.
  threshold?: number
  cursor?: string
  // Fires on every accepted press, before any movement (e.g. to focus the window).
  onPress?: (e: PointerEvent) => void
  onStart?: () => void
  onMove: (dx: number, dy: number, e: PointerEvent) => void
  onEnd: (moved: boolean, cancelled: boolean) => void
}

// Pointer Events drag with a single active pointer, so a second touch can't hijack it. Move and up
// are listened for on `window`, so the gesture survives the dragged element being removed mid-drag.
export const pointerDrag: Action<HTMLElement, PointerDragOptions> = (node, initial) => {
  let options = initial
  let pointerId: number | null = null
  let sx = 0
  let sy = 0
  let moved = false

  function down(e: PointerEvent): void {
    if (pointerId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return
    if (options.ignore && (e.target as Element).closest(options.ignore)) return
    e.preventDefault()
    e.stopPropagation()
    pointerId = e.pointerId
    sx = e.clientX
    sy = e.clientY
    moved = false
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    options.onPress?.(e)
  }

  function move(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    const dx = e.clientX - sx
    const dy = e.clientY - sy
    if (!moved) {
      if (Math.hypot(dx, dy) < (options.threshold ?? 3)) return
      moved = true
      document.body.style.cursor = options.cursor ?? 'grabbing'
      document.body.style.userSelect = 'none'
      options.onStart?.()
    }
    options.onMove(dx, dy, e)
  }

  function end(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    pointerId = null
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    options.onEnd(moved, e.type === 'pointercancel')
  }

  node.style.touchAction = 'none'
  node.addEventListener('pointerdown', down)

  return {
    update(next) {
      options = next
    },
    destroy() {
      node.removeEventListener('pointerdown', down)
      // A running gesture outlives its element (a dragged widget leaves its list) and cleans up in `end`.
    },
  }
}
