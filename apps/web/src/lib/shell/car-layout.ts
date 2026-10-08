// Where everything sits in the car layout (design v12, `cpL`): the core on the left, a column of tiles on the
// right and a bar along the bottom. All sizes are in CSS pixels.
export interface CarLayout {
  bar: number
  cols: 1 | 2
  rows: number
  rowMin: number
  // Width of the tiles' column, 0 when there are none.
  colW: number
  // What is left for the core.
  zoneW: number
  zoneH: number
  // Centre and radius of the core, and the ring drawn around it.
  ox: number
  oy: number
  radius: number
  ringDiameter: number
  // Vertical positions of the state label above the core and of the hint under it.
  labelTop: number
  hintTop: number
}

const MARGIN = 12
const LOW_SCREEN = 560
// Two columns of tiles only on a screen this much wider than it is tall, and only when one column would be long.
const TWO_COLUMNS_RATIO = 2.1
const TWO_COLUMNS_MIN_WIDTH = 1100
const TWO_COLUMNS_MIN_TILES = 4

export function carLayout(vw: number, vh: number, tiles: number): CarLayout {
  const bar = vh < LOW_SCREEN ? 64 : 76
  const cols = vw / vh > TWO_COLUMNS_RATIO && vw >= TWO_COLUMNS_MIN_WIDTH && tiles >= TWO_COLUMNS_MIN_TILES ? 2 : 1
  const colW = tiles ? Math.round(cols === 2 ? Math.min(680, vw * 0.44) : Math.min(380, Math.max(240, vw * 0.36))) : 0
  const zoneW = vw - (tiles ? colW + 2 * MARGIN : 0)
  const zoneH = vh - bar - 2 * MARGIN
  const radius = Math.max(56, Math.min(zoneW * 0.26, zoneH * 0.25))
  const oy = zoneH * 0.47
  return {
    bar,
    cols,
    rows: Math.max(1, Math.ceil(tiles / cols)),
    rowMin: vh < LOW_SCREEN ? 84 : 100,
    colW,
    zoneW,
    zoneH,
    ox: zoneW / 2,
    oy,
    radius,
    ringDiameter: Math.round(radius * 2.5),
    labelTop: Math.max(14, oy - radius * 1.25 - 40),
    hintTop: oy + radius * 1.25 + 10,
  }
}
