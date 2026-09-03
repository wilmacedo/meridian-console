// Four phase-shifted sine waves derived from the same telemetry series, per
// docs/design-handoff.md#screen-1--system-overview.
export function waveSeries(base: number[], tick: number, phase: number): number[] {
  return base.map((v, k) => 46 + Math.sin(k / 3.4 + tick / 6 + phase) * 26 + (phase === 0 ? v * 0.18 : 0))
}
