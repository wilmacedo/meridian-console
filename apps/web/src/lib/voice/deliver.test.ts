import { describe, expect, it, vi } from 'vitest'
import { deliver } from './deliver'

const dropped = () => Promise.reject(new TypeError('Failed to fetch'))

describe('deliver', () => {
  it('tries again when the network drops the upload', async () => {
    const doFetch = vi.fn().mockImplementationOnce(dropped).mockResolvedValueOnce(new Response('ok'))
    const res = await deliver('/api/voice/ask', { method: 'POST' }, 3, 0, doFetch)
    expect(await res.text()).toBe('ok')
    expect(doFetch).toHaveBeenCalledTimes(2)
  })

  it('gives up after the last attempt', async () => {
    const doFetch = vi.fn().mockImplementation(dropped)
    await expect(deliver('/x', {}, 3, 0, doFetch)).rejects.toThrow('Failed to fetch')
    expect(doFetch).toHaveBeenCalledTimes(3)
  })

  it('does not try again a request the owner cut off', async () => {
    const controller = new AbortController()
    controller.abort()
    const doFetch = vi.fn().mockImplementation(dropped)
    await expect(deliver('/x', { signal: controller.signal }, 3, 0, doFetch)).rejects.toThrow()
    expect(doFetch).toHaveBeenCalledTimes(1)
  })

  it('does not try again once the server answered, even with an error', async () => {
    const doFetch = vi.fn().mockResolvedValue(new Response('', { status: 409 }))
    expect((await deliver('/x', {}, 3, 0, doFetch)).status).toBe(409)
    expect(doFetch).toHaveBeenCalledTimes(1)
  })
})
