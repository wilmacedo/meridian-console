// Port of the reference's `pts()` helper: turns a series of 0-100 values into an SVG polyline
// `points` string over a `width` x `height` viewBox, optionally closed into a filled area.
export function polylinePoints(values: number[], width: number, height: number, close: boolean, topPadding = 2): string {
  const n = values.length
  const points = values.map((v, i) => {
    const x = Math.round((i / (n - 1)) * width * 10) / 10
    const y = Math.round((height - (v / 100) * (height - topPadding) - 1) * 10) / 10
    return `${x},${y}`
  })
  if (!close) return points.join(' ')
  return `0,${height} ${points.join(' ')} ${width},${height}`
}

// Four phase-shifted sine waves derived from the same telemetry series, per
// docs/design-handoff.md#screen-1--system-overview.
export function waveSeries(base: number[], tick: number, phase: number): number[] {
  return base.map((v, k) => 46 + Math.sin(k / 3.4 + tick / 6 + phase) * 26 + (phase === 0 ? v * 0.18 : 0))
}
