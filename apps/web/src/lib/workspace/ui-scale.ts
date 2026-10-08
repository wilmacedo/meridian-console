// How much the whole interface is scaled. The interface is made for a page about 800 px wide. An in-car browser can
// hand over a window of about 1280 px (everything is then drawn small, and scaling up makes it lay out like a smaller
// window) or, in its mobile mode, one of about 400 px with twice the pixels (it lays out cramped, and scaling down makes
// it lay out like a larger window, still sharp).
export type UiScaleSetting = 'auto' | number

export const UI_SCALES: readonly number[] = [0.5, 0.75, 1, 1.5, 2, 2.5]

const MIN_SCALE = 0.4
const MAX_SCALE = 2.5
// In CarPlay mode `auto` scales until the page lays out about this wide, which is like a phone turned sideways.
export const CAR_TARGET_WIDTH = 800
const STEP = 0.05

export function uiScaleFor(setting: UiScaleSetting, carplay: boolean, windowWidth: number): number {
  if (setting !== 'auto') return setting
  if (!carplay) return 1
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(windowWidth / CAR_TARGET_WIDTH / STEP) * STEP))
}

export function sanitizeScale(stored: unknown): UiScaleSetting {
  return typeof stored === 'number' && Number.isFinite(stored) ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, stored)) : 'auto'
}
