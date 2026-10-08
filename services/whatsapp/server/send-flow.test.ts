import { describe, expect, it, vi } from 'vitest'
import { confirmedSend } from './send-flow.js'
import { SendLimiter } from './send-policy.js'

const flow = (answer: boolean, limiter = new SendLimiter()) => {
  const send = vi.fn(async () => ({ id: '1' }))
  const confirm = vi.fn(async () => answer)
  const audit = vi.fn()
  return { send, confirm, audit, limiter, run: () => confirmedSend({ ctx: { confirm }, limiter, to: 'Maria', what: '"oi"', send, audit }) }
}

describe('confirmedSend', () => {
  it('sends only after the owner confirms, and says who and what on the card', async () => {
    const f = flow(true)
    expect(await f.run()).toEqual({ sent: true, to: 'Maria' })
    expect(f.confirm).toHaveBeenCalledWith('WhatsApp to Maria: "oi"')
    expect(f.send).toHaveBeenCalledOnce()
    expect(f.audit).toHaveBeenCalledWith('sent to Maria')
  })

  it('sends nothing when the owner declines, or when there is no screen to ask on', async () => {
    const f = flow(false)
    await expect(f.run()).rejects.toThrow(/did not confirm/)
    expect(f.send).not.toHaveBeenCalled()
    expect(f.audit).not.toHaveBeenCalled()
  })

  it('does not count a declined or failed send against the limit', async () => {
    const limiter = new SendLimiter(1, 10)
    await expect(flow(false, limiter).run()).rejects.toThrow()
    const failing = flow(true, limiter)
    failing.send.mockRejectedValueOnce(new Error('offline'))
    await expect(failing.run()).rejects.toThrow('offline')
    await expect(flow(true, limiter).run()).resolves.toBeTruthy()
  })

  it('refuses before bothering the owner when the limit is reached', async () => {
    const limiter = new SendLimiter(1, 10)
    await flow(true, limiter).run()
    const f = flow(true, limiter)
    await expect(f.run()).rejects.toThrow(/minute/)
    expect(f.confirm).not.toHaveBeenCalled()
  })
})
