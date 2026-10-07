import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decrypt, encrypt, parseKey } from './token-crypto.js'

const key = randomBytes(32)

describe('token crypto', () => {
  it('round-trips a token and never stores it in the clear', () => {
    const sealed = encrypt(key, '1//refresh-token')
    expect(sealed).not.toContain('refresh-token')
    expect(decrypt(key, sealed)).toBe('1//refresh-token')
  })

  it('seals the same text differently each time', () => {
    expect(encrypt(key, 'a')).not.toBe(encrypt(key, 'a'))
  })

  it('refuses a different key and a tampered payload', () => {
    const sealed = encrypt(key, 'secret')
    expect(() => decrypt(randomBytes(32), sealed)).toThrow()
    const raw = Buffer.from(sealed, 'base64')
    raw[raw.length - 1] ^= 1
    expect(() => decrypt(key, raw.toString('base64'))).toThrow()
  })

  it('accepts only a base64 key of 32 bytes', () => {
    expect(parseKey(key.toString('base64'))).toEqual(key)
    expect(parseKey(randomBytes(16).toString('base64'))).toBeUndefined()
    expect(parseKey('')).toBeUndefined()
    expect(parseKey(undefined)).toBeUndefined()
  })
})
