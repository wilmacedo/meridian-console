import type { Action } from 'svelte/action'

export interface PointerDragOptions {
  // Pointer-downs landing on a match (e.g. a button inside a drag handle) are ignored.
  ignore?: string
  // Movement in px before the gesture counts as a drag; below it, releasing is a plain click.
  threshold?: number
  cursor?: string
  // Fires on every accepted press, before any movement (e.g. to focus the window).
  onPress?: () => void
  onStart?: () => void
  onMove: (dx: number, dy: number) => void
  onEnd: (moved: boolean) => void
}

// Pointer Events drag with capture, so a gesture survives leaving the element, and a single active
// pointer, so a second touch can't hijack it.
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
    node.setPointerCapture(e.pointerId)
    options.onPress?.()
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
    options.onMove(dx, dy)
  }

  function end(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    pointerId = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    options.onEnd(moved)
  }

  node.style.touchAction = 'none'
  node.addEventListener('pointerdown', down)
  node.addEventListener('pointermove', move)
  node.addEventListener('pointerup', end)
  node.addEventListener('pointercancel', end)

  return {
    update(next) {
      options = next
    },
    destroy() {
      node.removeEventListener('pointerdown', down)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', end)
      node.removeEventListener('pointercancel', end)
    },
  }
}
