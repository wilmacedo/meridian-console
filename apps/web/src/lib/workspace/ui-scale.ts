// How much the whole interface is enlarged. An in-car browser can hand the page a window of about 1280 px that is then
// shown on a screen 800 px wide, so everything is drawn at about 60% of its size and cannot be read; scaling the page
// up makes it lay out as if the window were smaller.
export type UiScaleSetting = 'auto' | number

export const UI_SCALES: readonly number[] = [1, 1.5, 2, 2.5]

const MIN_SCALE = 1
const MAX_SCALE = 2.5
// In CarPlay mode `auto` scales until the page is about this wide, which lays out like a phone turned sideways.
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
