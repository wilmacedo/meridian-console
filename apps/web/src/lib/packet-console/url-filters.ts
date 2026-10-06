import { consoleState } from './console-state.svelte'

const Q_PARAM = 'q'
const LVL_OFF_PARAM = 'lvl-off'
const CHAN_OFF_PARAM = 'chan-off'

function offMapFrom(param: string | null): Record<string, boolean> {
  if (!param) return {}
  return Object.fromEntries(param.split(',').filter(Boolean).map((key) => [key, true]))
}

function offKeysOf(map: Record<string, boolean>): string[] {
  return Object.keys(map).filter((key) => map[key])
}

// Reads q/lvl-off/chan-off from the current URL into consoleState — called once when the panel
// mounts, before the packet feed starts, so a reload lands back on the same filtered view. A param
// missing entirely (first-ever visit) leaves consoleState's default filters in place rather than
// clearing them — only an explicit (even empty) value in the URL overrides the default.
export function readFiltersFromUrl(): void {
  const params = new URLSearchParams(location.search)
  const q = params.get(Q_PARAM)
  if (q) consoleState.q = q
  const lvlOff = params.get(LVL_OFF_PARAM)
  if (lvlOff !== null) consoleState.lvlOff = offMapFrom(lvlOff)
  const chanOff = params.get(CHAN_OFF_PARAM)
  if (chanOff !== null) consoleState.chanOff = offMapFrom(chanOff)
}

// Mirrors consoleState's filters into the URL via replaceState — no new history entry per
// keystroke/toggle, since these are filter edits, not navigation.
export function writeFiltersToUrl(): void {
  const params = new URLSearchParams(location.search)

  const chanOffKeys = offKeysOf(consoleState.chanOff)
  if (chanOffKeys.length) params.set(CHAN_OFF_PARAM, chanOffKeys.join(','))
  else params.delete(CHAN_OFF_PARAM)

  const lvlOffKeys = offKeysOf(consoleState.lvlOff)
  if (lvlOffKeys.length) params.set(LVL_OFF_PARAM, lvlOffKeys.join(','))
  else params.delete(LVL_OFF_PARAM)

  if (consoleState.q) params.set(Q_PARAM, consoleState.q)
  else params.delete(Q_PARAM)

  const query = params.toString()
  history.replaceState(null, '', query ? `${location.pathname}?${query}` : location.pathname)
}
