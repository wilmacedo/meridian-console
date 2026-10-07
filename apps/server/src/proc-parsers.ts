// Pure parsers for the Linux files host telemetry reads, kept apart so they can be tested on samples.

export interface CpuTimes {
  idle: number
  total: number
}

export function parseCpuTimes(stat: string): CpuTimes {
  const line = stat.split('\n').find((l) => l.startsWith('cpu '))
  if (!line) throw new Error('no aggregate cpu line in /proc/stat')
  const fields = line.trim().split(/\s+/).slice(1).map(Number)
  // idle + iowait count as idle; guest time is already included in user/nice.
  const idle = (fields[3] ?? 0) + (fields[4] ?? 0)
  const total = fields.slice(0, 8).reduce((a, b) => a + b, 0)
  return { idle, total }
}

export function cpuPercent(prev: CpuTimes, next: CpuTimes): number {
  const total = next.total - prev.total
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, (1 - (next.idle - prev.idle) / total) * 100))
}

// Memory in use (total minus what the kernel can hand out without swapping) and total, in GB.
export function parseMemInfo(text: string): { usedGb: number; totalGb: number } {
  const kb = (key: string): number => Number(new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(text)?.[1] ?? NaN)
  const total = kb('MemTotal')
  const available = kb('MemAvailable')
  if (Number.isNaN(total) || Number.isNaN(available)) throw new Error('unexpected /proc/meminfo')
  const gb = (v: number): number => v / 1024 / 1024
  return { usedGb: gb(total - available), totalGb: gb(total) }
}

// Bytes received plus sent over every interface except loopback.
export function parseNetBytes(text: string): number {
  let bytes = 0
  for (const line of text.split('\n').slice(2)) {
    const [name, rest] = line.split(':')
    if (!rest || name.trim() === 'lo') continue
    const f = rest.trim().split(/\s+/).map(Number)
    bytes += (f[0] ?? 0) + (f[8] ?? 0)
  }
  return bytes
}

// Hottest thermal zone, in Celsius, from values in millidegrees.
export const hottest = (millidegrees: number[]): number | null => {
  const valid = millidegrees.filter((v) => Number.isFinite(v) && v > 0)
  return valid.length ? Math.max(...valid) / 1000 : null
}
