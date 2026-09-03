// Turns a series of 0-100 values into an SVG polyline `points` string over a `width` x `height`
// viewBox, optionally closed into a filled area. Shared by the overview wave panel and the
// service panel's metric sparklines.
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
