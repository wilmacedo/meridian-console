import { defineServerService, type ServiceStatus } from '@meridian/service-sdk/server'
import { getRuntime, stopRuntime } from './runtime.js'
import { sweepSpoken } from './tts.js'
import { whatsappActions } from './whatsapp-actions.js'
import { whatsappRoutes } from './whatsapp-routes.js'

const STALE_SPOKEN_MS = 10 * 60_000

async function status(): Promise<ServiceStatus> {
  const { client, process: bridge } = getRuntime()
  if (bridge.problem) return { state: 'offline', message: bridge.problem }
  try {
    const bridgeStatus = await client.status()
    if (bridgeStatus.state === 'connected') return { state: 'online' }
    if (bridgeStatus.state === 'pairing') return { state: 'degraded', message: 'waiting for the phone to scan the QR code' }
    return { state: 'degraded', message: 'connecting to WhatsApp' }
  } catch {
    return { state: 'offline', message: 'the bridge is not answering' }
  }
}

export default defineServerService({
  manifest: {
    id: 'whatsapp',
    name: 'whatsapp',
    mono: 'WA',
    desc: 'Personal WhatsApp · read, search and send through NOX',
  },
  routes: whatsappRoutes,
  status,
  actions: whatsappActions,
  events: (emit) => {
    const runtime = getRuntime(emit)
    runtime.process.start()
    void sweepSpoken(runtime.config.outbox, STALE_SPOKEN_MS)
    return stopRuntime
  },
})
