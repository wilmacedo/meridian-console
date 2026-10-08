import { isStackedFor, type LayoutMode } from './layout-mode'
import { uiScaleFor, type UiScaleSetting } from './ui-scale'

// The workspace's choice of layout, and the size of the screen it is shown on. `w` and `h` are in the interface's own
// pixels: the window's size divided by `scale`, so everything that lays out from them follows the enlargement.
export const layout = $state({ mode: 'auto' as LayoutMode, w: window.innerWidth, h: window.innerHeight, scale: 1 })

let setting: UiScaleSetting = 'auto'
let carplay = false

function measure(): void {
  const scale = uiScaleFor(setting, carplay, window.innerWidth)
  Object.assign(layout, { scale, w: window.innerWidth / scale, h: window.innerHeight / scale })
}

window.addEventListener('resize', measure)

// The workspace's scale setting, and whether it is in CarPlay mode (which `auto` depends on).
export function configureScale(next: UiScaleSetting, inCar: boolean): void {
  setting = next
  carplay = inCar
  measure()
}

export const isStacked = (): boolean => isStackedFor(layout.mode, layout.w, layout.h)
