import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VoiceMessages } from './voice-messages.js'

let dir: string
let now: number
let messages: VoiceMessages

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'voice-messages-'))
  now = 1_000_000
  messages = new VoiceMessages(dir, () => now)
})

afterEach(() => rm(dir, { recursive: true, force: true }))

describe('VoiceMessages', () => {
  it('captures only the next recording of the workspace it was armed for', () => {
    messages.arm('default', 'Maria')
    expect(messages.take('carplay')).toBeUndefined()
    expect(messages.take('default')).toBe('Maria')
    expect(messages.take('default')).toBeUndefined()
  })

  it('forgets a request the owner did not answer in time, or stopped', () => {
    messages.arm('default', 'Maria')
    now += 3 * 60_000
    expect(messages.take('default')).toBeUndefined()
    messages.arm('default', 'Maria')
    messages.disarm()
    expect(messages.take('default')).toBeUndefined()
  })

  it('saves a recording with the extension of its container', async () => {
    expect(await messages.save(Buffer.from('a'), 'audio/webm;codecs=opus')).toMatch(/message-\d+-[0-9a-f]+\.webm$/)
    expect(await messages.save(Buffer.from('a'), 'audio/mp4')).toMatch(/\.m4a$/)
  })

  it('removes its own recordings and nothing else', async () => {
    const path = await messages.save(Buffer.from('a'), 'audio/webm')
    const other = join(dir, 'notes.webm')
    await writeFile(other, 'b')
    await messages.remove(other)
    await messages.remove('/etc/hostname')
    await messages.remove(path)
    expect(await readdir(dir)).toEqual(['notes.webm'])
  })

  it('sweeps recordings left behind, leaving recent ones', async () => {
    const old = await messages.save(Buffer.from('a'), 'audio/webm')
    now += 1
    const recent = await messages.save(Buffer.from('a'), 'audio/webm')
    await utimes(old, new Date(now - 20 * 60_000), new Date(now - 20 * 60_000))
    await utimes(recent, new Date(now), new Date(now))
    await messages.sweep(10 * 60_000)
    expect(await readdir(dir)).toEqual([recent.split('/').at(-1)])
  })
})
