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

// The room a rail takes at the stage's edge, as a CSS length, per side: sideways in the side layout, above or
// below in the stacked one (where the strips are STRIP_H tall).
export const STRIP_H = '200px'
export const STRIP_EXTRA = `calc(${STRIP_H} + 10px)`

export interface StageInsets {
  left: string
  right: string
  top: string
  bottom: string
}

export function stageInsets(sides: Record<RailId, boolean>, stacked: boolean): StageInsets {
  if (stacked) return { left: BARE_INSET, right: BARE_INSET, top: sides.L ? STRIP_EXTRA : '0px', bottom: sides.R ? STRIP_EXTRA : '0px' }
  return { left: insetOf(sides.L), right: insetOf(sides.R), top: '0px', bottom: '0px' }
}
