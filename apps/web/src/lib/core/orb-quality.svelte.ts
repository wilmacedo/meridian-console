// How much the orb draws. It is a device setting, not workspace state: a tablet and a desktop showing the
// same workspace want different amounts of work.
const KEY = 'meridian.orbQuality'

export type OrbQuality = 'high' | 'low'

export const orbQuality = $state({ value: (localStorage.getItem(KEY) === 'low' ? 'low' : 'high') as OrbQuality })

export function setOrbQuality(value: OrbQuality): void {
  orbQuality.value = value
  localStorage.setItem(KEY, value)
}
