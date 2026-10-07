import { randomBytes } from 'node:crypto'
import type { FastifyPluginAsync } from '@meridian/service-sdk/server'
import { getRuntime, missingConfig } from './runtime.js'

const STATE_TTL_MS = 10 * 60_000
const MAX_RANGE_MS = 62 * 24 * 3_600_000
const CALLBACK_PATH = '/api/services/calendar/oauth/callback'

// One-use sign-in tickets. The redirect URI is remembered with each, because Google wants the exact same one
// again when the code is exchanged and the owner may reach Meridian from more than one address.
const pending = new Map<string, { redirectUri: string; expires: number }>()

function takeState(state: string | undefined): { redirectUri: string } | undefined {
  const entry = state ? pending.get(state) : undefined
  if (state) pending.delete(state)
  return entry && entry.expires > Date.now() ? entry : undefined
}

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim()

export function redirectUriFor(headers: Record<string, string | string[] | undefined>): string {
  if (process.env.CALENDAR_REDIRECT_URI) return process.env.CALENDAR_REDIRECT_URI
  const host = first(headers['x-forwarded-host']) ?? first(headers.host)
  const proto = first(headers['x-forwarded-proto']) ?? 'https'
  return `${proto}://${host}${CALLBACK_PATH}`
}

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const page = (message: string, ok: boolean): string =>
  `<!doctype html><meta charset="utf-8"><title>Calendar</title><body style="font:15px ui-monospace,monospace;background:#070707;color:#ddd;display:grid;place-items:center;height:100vh;margin:0"><p>${escapeHtml(message)}${ok ? '<br><br>You can close this tab.' : ''}</p>${ok ? '<script>setTimeout(() => window.close(), 1200)</script>' : ''}`

function parseInstant(value: string | undefined): number | undefined {
  const time = value ? Date.parse(value) : NaN
  return Number.isNaN(time) ? undefined : time
}

export const calendarRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { account?: string } }>('/oauth/start', async (request, reply) => {
    const problem = missingConfig()
    if (problem) return reply.code(503).type('text/html').send(page(problem, false))
    const { store, google } = getRuntime()

    const redirectUri = redirectUriFor(request.headers)
    const state = randomBytes(16).toString('hex')
    pending.set(state, { redirectUri, expires: Date.now() + STATE_TTL_MS })
    const hint = request.query.account ? store.account(request.query.account)?.email : undefined
    return reply.redirect(google.authUrl(redirectUri, state, hint))
  })

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/oauth/callback', async (request, reply) => {
    const { code, state, error } = request.query
    const ticket = takeState(state)
    if (!ticket) return reply.code(400).type('text/html').send(page('This sign-in link has expired. Close this tab and connect again from the calendar window.', false))
    if (error || !code) return reply.code(400).type('text/html').send(page(`Google did not complete the sign-in (${error ?? 'no code'}).`, false))

    try {
      const account = await getRuntime().service.connect(code, ticket.redirectUri)
      return reply.type('text/html').send(page(`${account.email} is connected.`, true))
    } catch (err) {
      return reply.code(502).type('text/html').send(page(err instanceof Error ? err.message : String(err), false))
    }
  })

  app.get('/sources', async () => {
    const problem = missingConfig()
    if (problem) return { configured: false, message: problem, accounts: [], sources: [] }
    const { store } = getRuntime()
    const accounts = store.accounts()
    const status = new Map(accounts.map((a) => [a.id, a]))
    return {
      configured: true,
      accounts: accounts.map(({ id, email, status: s }) => ({ id, email, status: s })),
      sources: store.sources().map((s) => ({
        id: s.id,
        accountId: s.accountId,
        label: s.label,
        account: status.get(s.accountId)?.email ?? '',
        provider: 'GOOGLE',
        accessRole: s.accessRole,
        hue: s.hue,
        visible: s.visible,
        isDefault: s.isDefault,
        status: status.get(s.accountId)?.status ?? 'pending',
      })),
    }
  })

  app.patch<{ Params: { id: string }; Body: { visible?: boolean; hue?: number; isDefault?: boolean } }>(
    '/sources/:id',
    {
      schema: {
        body: { type: 'object', additionalProperties: false, properties: { visible: { type: 'boolean' }, hue: { type: 'number' }, isDefault: { type: 'boolean' } } },
      },
    },
    async (request, reply) => {
      const updated = getRuntime().store.updateSource(request.params.id, request.body ?? {})
      return updated ? { ok: true } : reply.code(404).send({ error: 'unknown calendar' })
    },
  )

  app.delete<{ Params: { id: string } }>('/accounts/:id', async (request, reply) => {
    const removed = await getRuntime().service.disconnect(request.params.id)
    return removed ? { ok: true } : reply.code(404).send({ error: 'unknown account' })
  })

  app.get<{ Querystring: { from?: string; to?: string } }>('/events', async (request, reply) => {
    if (missingConfig()) return { events: [], errors: [] }
    const from = parseInstant(request.query.from)
    const to = parseInstant(request.query.to)
    if (from === undefined || to === undefined || to <= from || to - from > MAX_RANGE_MS) {
      return reply.code(400).send({ error: 'from and to must be ISO times, to after from, at most 62 days apart' })
    }
    return getRuntime().service.events(new Date(from).toISOString(), new Date(to).toISOString())
  })
}
