import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { allowedFile, SendLimiter } from './send-policy.js'

describe('SendLimiter', () => {
  it('stops a burst and forgives it a minute later', () => {
    let now = 0
    const limiter = new SendLimiter(2, 10, () => now)
    limiter.check()
    limiter.record()
    limiter.check()
    limiter.record()
    expect(() => limiter.check()).toThrow(/minute/)
    now = 61_000
    expect(() => limiter.check()).not.toThrow()
  })

  it('caps the hour', () => {
    let now = 0
    const limiter = new SendLimiter(100, 3, () => now)
    for (let i = 0; i < 3; i++) {
      limiter.check()
      limiter.record()
      now += 30_000
    }
    expect(() => limiter.check()).toThrow(/hour/)
  })

  it('does not count a send that was refused', () => {
    const limiter = new SendLimiter(1, 10, () => 0)
    limiter.check()
    expect(() => limiter.check()).not.toThrow()
  })
})

describe('allowedFile', () => {
  const base = mkdtempSync(join(tmpdir(), 'wa-send-'))
  const allowed = join(base, 'out')
  const secret = join(base, 'secret.txt')
  mkdirSync(allowed)
  writeFileSync(join(allowed, 'photo.jpg'), 'x')
  writeFileSync(secret, 'x')
  symlinkSync(secret, join(allowed, 'link.txt'))

  it('accepts a file inside a folder', async () => {
    expect(await allowedFile(join(allowed, 'photo.jpg'), [allowed])).toContain('photo.jpg')
  })

  it('refuses a file elsewhere, a relative path, a missing file and a symlink that escapes', async () => {
    await expect(allowedFile(secret, [allowed])).rejects.toThrow(/outside/)
    await expect(allowedFile('photo.jpg', [allowed])).rejects.toThrow(/absolute/)
    await expect(allowedFile(join(allowed, 'nope.jpg'), [allowed])).rejects.toThrow(/does not exist/)
    await expect(allowedFile(join(allowed, 'link.txt'), [allowed])).rejects.toThrow(/outside/)
  })

  it('does not treat a sibling with the same prefix as inside', async () => {
    mkdirSync(`${allowed}-evil`)
    writeFileSync(join(`${allowed}-evil`, 'a.txt'), 'x')
    await expect(allowedFile(join(`${allowed}-evil`, 'a.txt'), [allowed])).rejects.toThrow(/outside/)
  })
})
