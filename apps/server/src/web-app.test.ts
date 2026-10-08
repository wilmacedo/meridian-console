import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { registerWebApp } from './web-app.js'

function build(): string {
  const root = mkdtempSync(join(tmpdir(), 'meridian-web-'))
  mkdirSync(join(root, 'assets'))
  writeFileSync(join(root, 'index.html'), '<html>meridian</html>')
  writeFileSync(join(root, 'assets', 'app-abc123.js'), 'console.log(1)')
  return root
}

describe('registerWebApp', () => {
  it('serves the page, always revalidated, and hashed assets for good', async () => {
    const app = Fastify()
    expect(await registerWebApp(app, build())).toBe(true)
    const page = await app.inject('/')
    expect(page.statusCode).toBe(200)
    expect(page.body).toContain('meridian')
    expect(page.headers['cache-control']).toBe('no-cache')
    const asset = await app.inject('/assets/app-abc123.js')
    expect(asset.statusCode).toBe(200)
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable')
  })

  it('sends the compressed copy of an asset when the build has one and the browser takes it', async () => {
    const app = Fastify()
    const root = build()
    writeFileSync(join(root, 'assets', 'ort-abc123.wasm'), 'wasm')
    writeFileSync(join(root, 'assets', 'ort-abc123.wasm.br'), 'br')
    await registerWebApp(app, root)
    const br = await app.inject({ url: '/assets/ort-abc123.wasm', headers: { 'accept-encoding': 'br, gzip' } })
    expect(br.headers['content-encoding']).toBe('br')
    expect(br.body).toBe('br')
    expect(br.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    const plain = await app.inject({ url: '/assets/ort-abc123.wasm', headers: { 'accept-encoding': 'identity' } })
    expect(plain.body).toBe('wasm')
  })

  it('leaves the API routes alone', async () => {
    const app = Fastify()
    app.get('/health', async () => ({ status: 'ok' }))
    await registerWebApp(app, build())
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' })
    expect((await app.inject('/api/nothing')).statusCode).toBe(404)
  })

  it('does nothing without a build', async () => {
    const app = Fastify()
    expect(await registerWebApp(app, mkdtempSync(join(tmpdir(), 'meridian-empty-')))).toBe(false)
    expect((await app.inject('/')).statusCode).toBe(404)
  })
})
