import { describe, expect, it } from 'vitest'
import { parseWhen, resolveChat } from './chat-ref.js'

const contacts = (found: { jid: string; name: string; isGroup?: boolean }[]) => ({ contacts: async () => found.map((c) => ({ isGroup: false, ...c })) })

describe('resolveChat', () => {
  it('passes an id through and normalises a phone number', async () => {
    const none = contacts([])
    expect(await resolveChat(none, '5511999990000@s.whatsapp.net')).toBe('5511999990000@s.whatsapp.net')
    expect(await resolveChat(none, '+55 11 99999-0000')).toBe('5511999990000')
  })

  it('finds a single match by name', async () => {
    expect(await resolveChat(contacts([{ jid: 'a@s.whatsapp.net', name: 'Maria Souza' }]), 'maria')).toBe('a@s.whatsapp.net')
  })

  it('prefers an exact name over partial ones', async () => {
    const found = contacts([{ jid: 'a@s.whatsapp.net', name: 'Maria' }, { jid: 'b@s.whatsapp.net', name: 'Maria Souza' }])
    expect(await resolveChat(found, 'maria')).toBe('a@s.whatsapp.net')
  })

  it('refuses to guess between several matches and lists them', async () => {
    const found = contacts([{ jid: 'a@s.whatsapp.net', name: 'Ana Lima' }, { jid: 'b@s.whatsapp.net', name: 'Ana Costa' }])
    await expect(resolveChat(found, 'ana')).rejects.toThrow(/several chats.*Ana Lima.*Ana Costa/)
  })

  it('says so when nothing matches', async () => {
    await expect(resolveChat(contacts([]), 'nobody')).rejects.toThrow(/no contact or group/)
  })
})

describe('parseWhen', () => {
  it('reads a bare date as a local day and the end of a range as the day after', () => {
    expect(parseWhen('2026-10-08', 'from')).toBe(new Date(2026, 9, 8).getTime())
    expect(parseWhen('2026-10-08', 'to', true)).toBe(new Date(2026, 9, 9).getTime())
  })

  it('accepts an ISO instant, nothing, and rejects garbage', () => {
    expect(parseWhen('2026-10-08T12:00:00Z', 'from')).toBe(Date.parse('2026-10-08T12:00:00Z'))
    expect(parseWhen(undefined, 'from')).toBeUndefined()
    expect(() => parseWhen('tomorrow', 'from')).toThrow(/YYYY-MM-DD/)
  })
})
