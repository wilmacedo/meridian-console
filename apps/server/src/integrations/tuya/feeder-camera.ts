import type { FastifyInstance } from 'fastify'
import { getToken, tuya } from './tuya-client.js'

const GO2RTC_API_URL = process.env.GO2RTC_API_URL ?? 'http://127.0.0.1:1984'
const STREAM_NAME = 'feeder'

// Tuya stream URLs expire within about a minute, so one is allocated per viewing session and handed
// to go2rtc. That keeps the Tuya credentials out of go2rtc's container. PATCH, not PUT: PUT persists
// the stream into go2rtc's config file, which would write the secret URL to disk.
export function registerFeederCamera(app: FastifyInstance): void {
  app.post('/api/feeder/camera/session', async (_request, reply) => {
    const deviceId = process.env.TUYA_FEEDER_DEVICE_ID
    if (!deviceId) return reply.code(503).send({ error: 'TUYA_FEEDER_DEVICE_ID is not set' })

    const token = await getToken()
    const allocation = await tuya<{ url: string }>(
      'POST',
      `/v1.0/devices/${deviceId}/stream/actions/allocate`,
      { type: 'RTSP' },
      token,
    )
    if (!allocation.result?.url) {
      app.log.error({ code: allocation.code, msg: allocation.msg }, 'tuya stream allocation failed')
      return reply.code(502).send({ error: 'camera stream unavailable' })
    }

    const params = new URLSearchParams({ name: STREAM_NAME, src: allocation.result.url })
    const registered = await fetch(`${GO2RTC_API_URL}/api/streams?${params}`, { method: 'PATCH' })
    if (!registered.ok) {
      app.log.error({ status: registered.status }, 'go2rtc stream registration failed')
      return reply.code(502).send({ error: 'camera relay unavailable' })
    }

    return { stream: STREAM_NAME }
  })

  // The offer/answer exchange goes through here so go2rtc's API never has to be reachable from clients;
  // only its WebRTC media port (8555) is.
  app.post<{ Body: { type: string; sdp: string } }>('/api/feeder/camera/webrtc', async (request, reply) => {
    const answer = await fetch(`${GO2RTC_API_URL}/api/webrtc?src=${STREAM_NAME}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.body),
    })
    if (!answer.ok) {
      app.log.error({ status: answer.status }, 'go2rtc webrtc negotiation failed')
      return reply.code(502).send({ error: 'camera relay unavailable' })
    }
    return answer.json()
  })
}
