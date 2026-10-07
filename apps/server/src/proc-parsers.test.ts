import { describe, expect, it } from 'vitest'
import { cpuPercent, hottest, parseCpuTimes, parseMemInfo, parseNetBytes } from './proc-parsers.js'

describe('cpu', () => {
  const a = parseCpuTimes('cpu  100 0 100 700 100 0 0 0 0 0\ncpu0 1 1 1 1 1 0 0 0 0 0\n')
  const b = parseCpuTimes('cpu  200 0 200 750 150 0 0 0 0 0\n')

  it('splits idle from busy time', () => {
    expect(a).toEqual({ idle: 800, total: 1000 })
  })

  it('computes the busy share between two samples', () => {
    // 200 busy of 300 elapsed
    expect(cpuPercent(a, b)).toBeCloseTo(66.67, 1)
  })

  it('is 0 when no time elapsed', () => {
    expect(cpuPercent(a, a)).toBe(0)
  })
})

describe('parseMemInfo', () => {
  it('reports used as total minus available, in GB', () => {
    const text = 'MemTotal:       16777216 kB\nMemFree:         1000 kB\nMemAvailable:    8388608 kB\n'
    expect(parseMemInfo(text)).toEqual({ usedGb: 8, totalGb: 16 })
  })

  it('rejects an unexpected file', () => {
    expect(() => parseMemInfo('nope')).toThrow()
  })
})

describe('parseNetBytes', () => {
  const text = [
    'Inter-|   Receive                            |  Transmit',
    ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed',
    '    lo: 5000 10 0 0 0 0 0 0 5000 10 0 0 0 0 0 0',
    '  eth0: 1000 10 0 0 0 0 0 0 500 10 0 0 0 0 0 0',
    ' wlan0: 200 10 0 0 0 0 0 0 100 10 0 0 0 0 0 0',
  ].join('\n')

  it('sums received and sent bytes over non-loopback interfaces', () => {
    expect(parseNetBytes(text)).toBe(1800)
  })
})

describe('hottest', () => {
  it('returns the maximum zone in Celsius', () => {
    expect(hottest([45000, 61500, 30000])).toBe(61.5)
  })

  it('is null without a usable sensor', () => {
    expect(hottest([])).toBeNull()
    expect(hottest([Number.NaN, 0])).toBeNull()
  })
})
