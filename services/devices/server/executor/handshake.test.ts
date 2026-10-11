import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { newNonce, serverProof, verifyDeviceProof } from './handshake.js'
import { b64, decode, ServerKey, verifySignature } from './keys.js'

const device = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const raw = (publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(12)
  return { privateKey, publicKey: b64(raw) }
}
const deviceSign = (key: ReturnType<typeof device>, clientNonce: string, serverNonce: string, serverPub: string) =>
  b64(sign(null, Buffer.concat([Buffer.from('meridian-executor/v1/device\0'), ...[clientNonce, serverNonce, serverPub].map((f) => Buffer.from(f, 'base64'))]), key.privateKey))

describe('server key', () => {
  it('is created once, kept private, and loads back as the same identity', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'server-key-')), 'sub', 'server-key.json')
    const first = ServerKey.loadOrCreate(file)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(ServerKey.loadOrCreate(file).publicKey).toBe(first.publicKey)
    expect(decode(first.publicKey, 32)).toBeDefined()
  })

  it('signs messages that only its public key verifies', () => {
    const key = ServerKey.fromPrivate((generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer))
    const sig = key.sign(Buffer.from('hello'))
    expect(verifySignature(key.publicKey, Buffer.from('hello'), sig)).toBe(true)
    expect(verifySignature(key.publicKey, Buffer.from('hellp'), sig)).toBe(false)
    expect(verifySignature(device().publicKey, Buffer.from('hello'), sig)).toBe(false)
  })

  it('rejects malformed keys and signatures instead of throwing', () => {
    expect(verifySignature('nope', Buffer.from('x'), 'nope')).toBe(false)
    expect(decode(b64(Buffer.alloc(31)), 32)).toBeUndefined()
    expect(decode('not base64!', 32)).toBeUndefined()
  })
})

describe('the mutual challenge', () => {
  const setup = () => {
    const server = ServerKey.fromPrivate(generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer)
    return { server, dev: device(), clientNonce: newNonce(), serverNonce: newNonce() }
  }

  it('lets the device check the server it pinned, and the server check the device', () => {
    const { server, dev, clientNonce, serverNonce } = setup()
    const proof = serverProof(server, clientNonce, serverNonce, dev.publicKey)!
    const message = Buffer.concat([Buffer.from('meridian-executor/v1/server\0'), ...[clientNonce, serverNonce, dev.publicKey].map((f) => Buffer.from(f, 'base64'))])
    expect(verifySignature(server.publicKey, message, proof)).toBe(true)
    const sig = deviceSign(dev, clientNonce, serverNonce, server.publicKey)
    expect(verifyDeviceProof(dev.publicKey, clientNonce, serverNonce, server.publicKey, sig)).toBe(true)
  })

  it('refuses a device proof replayed on another connection or made for another server', () => {
    const { server, dev, clientNonce, serverNonce } = setup()
    const sig = deviceSign(dev, clientNonce, serverNonce, server.publicKey)
    expect(verifyDeviceProof(dev.publicKey, clientNonce, newNonce(), server.publicKey, sig)).toBe(false)
    expect(verifyDeviceProof(dev.publicKey, newNonce(), serverNonce, server.publicKey, sig)).toBe(false)
    expect(verifyDeviceProof(dev.publicKey, clientNonce, serverNonce, setup().server.publicKey, sig)).toBe(false)
    expect(verifyDeviceProof(device().publicKey, clientNonce, serverNonce, server.publicKey, sig)).toBe(false)
  })

  it('refuses a proof signed with the context of the other side', () => {
    const { server, dev, clientNonce, serverNonce } = setup()
    const asServer = serverProof(server, clientNonce, serverNonce, dev.publicKey)!
    expect(verifyDeviceProof(server.publicKey, clientNonce, serverNonce, dev.publicKey, asServer)).toBe(false)
  })

  it('does not build a proof from malformed fields', () => {
    const { server, dev } = setup()
    expect(serverProof(server, 'short', newNonce(), dev.publicKey)).toBeUndefined()
  })

  // The same values are asserted by the executor's tests: one wire format, two implementations.
  it('matches the shared test vector (seeds 1 and 2, nonces 3 and 4)', () => {
    const seed = (n: number) => Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.alloc(32, n)])
    const server = ServerKey.fromPrivate(seed(1))
    const cn = b64(Buffer.alloc(32, 3))
    const sn = b64(Buffer.alloc(32, 4))
    expect(server.publicKey).toBe('iojj3XQJ8ZX9UtstPLpdcspnCb8dlBIb83SIAbQPb1w=')
    expect(serverProof(server, cn, sn, 'gTl3Dqh9F19Wo1Rmw0x+zMuNipG07jeiXfYPW4/Js5Q=')).toBe('wrkHS78fzfMF0ykI8e7ZM07mI5+1WV3pPlQxZiEI2bOSagz3QWjmPY31pQFYP9CAGgcMGVuYZmP6lfCjJGf8DQ==')
    expect(verifyDeviceProof('gTl3Dqh9F19Wo1Rmw0x+zMuNipG07jeiXfYPW4/Js5Q=', cn, sn, server.publicKey, 'Nl2FdvuyVueWaS4AZogL5O3knOEiuTPBQm7uOCL2qd6HP3l3lCWGySa4NyM/7ZdkjmCLLhsO/LZG6Mlrg1JUDw==')).toBe(true)
  })
})
