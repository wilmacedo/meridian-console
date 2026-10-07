import type { RailId } from './widgets'

export const RAIL_INSET = 'calc(min(300px, 24vw) + 55px)'
export const BARE_INSET = '20px'

// Which sides of the stage make room for a rail. A side with widgets does; so do both while a widget is being
// dragged or a pin is being placed, because both rails appear then (empty ones included) to take the drop,
// and the stage must not sit under them or jump about while the owner is aiming.
export function railSides(rails: Record<RailId, readonly string[]>, placing: boolean): Record<RailId, boolean> {
  return { L: placing || rails.L.length > 0, R: placing || rails.R.length > 0 }
}

export const insetOf = (reserved: boolean): string => (reserved ? RAIL_INSET : BARE_INSET)
