import { logLinePool } from '../data/log-lines'

export interface LogLine {
  time: string
  level: string
  message: string
}

export function buildLogLines(count: number): LogLine[] {
  const pool = [...logLinePool, ...logLinePool].slice(0, count)
  return pool.map(([level, message], i) => ({
    time: `+${String(i).padStart(2, '0')}.${String((i * 37) % 100).padStart(2, '0')}`,
    level,
    message,
  }))
}
