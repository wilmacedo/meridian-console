import { isStackedFor, type LayoutMode } from './layout-mode'

// The workspace's choice of layout, and the size of the screen it is shown on.
export const layout = $state({ mode: 'auto' as LayoutMode, w: window.innerWidth, h: window.innerHeight })

window.addEventListener('resize', () => Object.assign(layout, { w: window.innerWidth, h: window.innerHeight }))

export const isStacked = (): boolean => isStackedFor(layout.mode, layout.w, layout.h)
