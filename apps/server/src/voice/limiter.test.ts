import { describe, expect, it } from 'vitest'
import { limiter } from './limiter.js'

describe('limiter', () => {
  it('never runs more than the limit at once, and runs everything in order of arrival', async () => {
    const run = limiter(2)
    let active = 0
    let peak = 0
    const started: number[] = []
    const task = (n: number) => async () => {
      started.push(n)
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 10))
      active--
      return n
    }
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => run(task(n))))
    expect(results).toEqual([1, 2, 3, 4, 5])
    expect(peak).toBe(2)
    expect(started).toEqual([1, 2, 3, 4, 5])
  })

  it('frees its place when a task fails', async () => {
    const run = limiter(1)
    await expect(run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    await expect(run(async () => 'next')).resolves.toBe('next')
  })
})
