import { describe, expect, it } from 'vitest'
import { containerUsage } from './docker.js'

describe('containerUsage', () => {
  const base = {
    cpu_stats: { cpu_usage: { total_usage: 2_000_000 }, system_cpu_usage: 100_000_000 },
    precpu_stats: { cpu_usage: { total_usage: 1_000_000 }, system_cpu_usage: 90_000_000 },
  }

  it('reports CPU as a share of the host', () => {
    // 1M container ns of 10M host ns
    expect(containerUsage({ ...base, memory_stats: {} }).cpu).toBeCloseTo(10)
  })

  it('excludes reclaimable cache from memory, in MB', () => {
    const mem = { usage: 300 * 1024 * 1024, stats: { inactive_file: 100 * 1024 * 1024 } }
    expect(containerUsage({ ...base, memory_stats: mem }).mem).toBeCloseTo(200)
  })

  it('is 0 CPU when the host counter did not advance', () => {
    const same = { cpu_stats: base.cpu_stats, precpu_stats: base.cpu_stats, memory_stats: {} }
    expect(containerUsage(same).cpu).toBe(0)
  })
})
