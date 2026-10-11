import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SendLimiter } from './send-policy.js'

const runtime = vi.hoisted(() => ({ status: { state: 'connected', qr: '', phone: '5585999990000' }, sent: [] as unknown[], audited: [] as string[] }))

vi.mock('./runtime.js', () => ({
  getRuntime: () => ({
    client: { status: async () => runtime.status, send: async (body: unknown) => (runtime.sent.push(body), { id: 'm1' }) },
    selfLimiter: (runtime as unknown as { limiter: SendLimiter }).limiter,
  }),
  audit: (message: string) => runtime.audited.push(message),
}))

const { whatsappActions } = await import('./whatsapp-actions.js')
const note = whatsappActions.find((a) => a.id === 'note-to-self')!
const run = (text: string) => (note.run as unknown as (i: { text: string }, ctx: { confirm: () => Promise<boolean> }) => Promise<unknown>)({ text }, { confirm: async () => false })

beforeEach(() => {
  Object.assign(runtime, { status: { state: 'connected', qr: '', phone: '5585999990000' }, sent: [], audited: [], limiter: new SendLimiter(3, 10) })
})

describe('note-to-self', () => {
  it("sends only to the owner's own number, marked as NOX's, without asking anyone", async () => {
    expect(note.input).not.toHaveProperty('properties.chat')
    expect(await run('Lembrete: Comprar pão')).toEqual({ sent: true })
    expect(runtime.sent).toEqual([{ chat: '5585999990000', text: 'NOX · Lembrete: Comprar pão' }])
    expect(runtime.audited).toEqual(['sent a note to the owner'])
  })

  it('refuses when WhatsApp is not connected', async () => {
    runtime.status = { state: 'pairing', qr: 'x', phone: '' }
    await expect(run('oi')).rejects.toThrow('not connected')
    expect(runtime.sent).toEqual([])
  })

  it('stops a flood of notes', async () => {
    for (let i = 0; i < 3; i++) await run(`n${i}`)
    await expect(run('n3')).rejects.toThrow('too many sends in a minute')
  })
})
