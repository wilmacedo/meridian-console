import { isStackedFor, type LayoutMode } from './layout-mode'
import { uiScaleFor, type UiScaleSetting } from './ui-scale'

// The workspace's choice of layout, and the size of the screen it is shown on. `w` and `h` are in the interface's own
// pixels: the window's size divided by `scale`, so everything that lays out from them follows the enlargement.
export const layout = $state({ mode: 'auto' as LayoutMode, w: window.innerWidth, h: window.innerHeight, scale: 1 })

let setting: UiScaleSetting = 'auto'
let carplay = false

function measure(): void {
  const scale = uiScaleFor(setting, carplay, window.innerWidth)
  seen = `${window.innerWidth}x${window.innerHeight}`
  Object.assign(layout, { scale, w: window.innerWidth / scale, h: window.innerHeight / scale })
}

window.addEventListener('resize', measure)
window.visualViewport?.addEventListener('resize', measure)
window.addEventListener('orientationchange', measure)
// An embedded browser can resize its window without telling the page; looking now and then is cheap.
const CHECK_MS = 1000
let seen = `${window.innerWidth}x${window.innerHeight}`
setInterval(() => {
  const now = `${window.innerWidth}x${window.innerHeight}`
  if (now === seen) return
  seen = now
  measure()
}, CHECK_MS)

// The workspace's scale setting, and whether it is in CarPlay mode (which `auto` depends on).
export function configureScale(next: UiScaleSetting, inCar: boolean): void {
  setting = next
  carplay = inCar
  measure()
}

export const isStacked = (): boolean => isStackedFor(layout.mode, layout.w, layout.h)
