import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sweepSpoken } from './tts.js'

let dir: string

beforeEach(async () => (dir = await mkdtemp(join(tmpdir(), 'outbox-'))))
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('sweepSpoken', () => {
  it('removes old spoken notes and leaves recent ones and anything else', async () => {
    const now = Date.now()
    for (const name of ['voice-1.mp3', 'voice-2.mp3', 'photo.jpg']) await writeFile(join(dir, name), 'x')
    const old = new Date(now - 60 * 60_000)
    await utimes(join(dir, 'voice-1.mp3'), old, old)
    await utimes(join(dir, 'photo.jpg'), old, old)
    await sweepSpoken(dir, 10 * 60_000, now)
    expect((await readdir(dir)).sort()).toEqual(['photo.jpg', 'voice-2.mp3'])
  })

  it('does nothing when there is no outbox yet', async () => {
    await expect(sweepSpoken(join(dir, 'missing'), 0)).resolves.toBeUndefined()
  })
})
