import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ago, Conversations, titleOf } from './conversations.js'

const home = () => mkdtempSync(join(tmpdir(), 'nox-conversations-'))

describe('Conversations', () => {
  it('remembers which conversations exist and which is current, across restarts', () => {
    const dir = home()
    let now = 1000
    const a = new Conversations(dir, () => now)
    a.begin('s1', 'o KVM', 'f1')
    now = 2000
    a.begin('s2', 'mensagem pra Maria', 'f1')
    a.touch('s2')
    const b = new Conversations(dir, () => now)
    expect(b.current()?.id).toBe('s2')
    expect(b.recent(10).map((c) => c.id)).toEqual(['s2', 's1'])
    b.enter('s1', 'f2')
    expect(new Conversations(dir).current()).toMatchObject({ id: 's1', fingerprint: 'f2' })
  })

  it('takes over the single session that came before it', () => {
    const dir = home()
    writeFileSync(join(dir, 'session-id'), 'old\n')
    writeFileSync(join(dir, 'prompt-hash'), 'f0\n')
    expect(new Conversations(dir).current()).toMatchObject({ id: 'old', title: 'Conversa anterior', fingerprint: 'f0' })
    expect(readdirSync(dir)).toEqual(['conversations.json'])
  })

  it('forgets a lost one, and leaves the current one when NOX changes', () => {
    const c = new Conversations(home())
    c.begin('s1', 'a', 'f')
    c.leave()
    expect(c.current()).toBeUndefined()
    expect(c.get('s1')).toBeDefined()
    c.enter('s1', 'f')
    c.forget('s1')
    expect(c.current()).toBeUndefined()
    expect(c.recent(10)).toEqual([])
  })
})

describe('titleOf and ago', () => {
  it('makes a short one-line title', () => {
    expect(titleOf('  liga\n o  KVM ')).toBe('liga o KVM')
    expect(titleOf('x'.repeat(100))).toHaveLength(81)
    expect(titleOf('')).toBe('Sem título')
  })

  it('says how long ago in minutes, hours or days', () => {
    expect(ago(60_000)).toBe('1 minute ago')
    expect(ago(40 * 60_000)).toBe('40 minutes ago')
    expect(ago(3 * 3_600_000)).toBe('3 hours ago')
    expect(ago(5 * 86_400_000)).toBe('5 days ago')
  })
})
