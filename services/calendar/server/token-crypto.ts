import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const IV_BYTES = 12
const TAG_BYTES = 16

export function parseKey(raw: string | undefined): Buffer | undefined {
  if (!raw) return undefined
  const key = Buffer.from(raw.trim(), 'base64')
  return key.length === 32 ? key : undefined
}

export function encrypt(key: Buffer, plain: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
}

export function decrypt(key: Buffer, sealed: string): string {
  const raw = Buffer.from(sealed, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES))
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8')
}
