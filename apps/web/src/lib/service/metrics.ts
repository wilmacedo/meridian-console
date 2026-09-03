import { polylinePoints } from '../shared/polyline'

export interface MetricCard {
  label: string
  value: string
  points: string
  area: string
}

interface TelemetrySeries {
  a: number[]
  b: number[]
  c: number[]
}

function lastOf(values: number[]) {
  return values[values.length - 1]
}

export function buildMetricCards(series: TelemetrySeries): MetricCard[] {
  const defs: [string, string, number[]][] = [
    ['CPU', `${Math.round(lastOf(series.a))}%`, series.a],
    ['MEMORY', '612 MB', series.b],
    ['EVENT BUS', `${Math.round(lastOf(series.c) * 4)}/s`, series.c],
  ]
  return defs.map(([label, value, values]) => ({
    label,
    value,
    points: polylinePoints(values, 200, 42, false),
    area: polylinePoints(values, 200, 42, true),
  }))
}
