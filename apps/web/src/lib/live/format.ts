const pad = (n: number, width = 2): string => String(n).padStart(width, '0')

// 3d 14h, 6h 41m, 12m.
export function uptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function clockTime(iso: string, millis = false): string {
  const d = new Date(iso)
  const base = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return millis ? `${base}.${pad(d.getMilliseconds(), 3)}` : base
}

export const LEVEL_COLOR = { info: 'rgba(var(--nx-ac), 0.6)', warn: '#ffd34d', error: '#ff6b8a' } as const
