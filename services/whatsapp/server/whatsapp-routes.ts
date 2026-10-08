import QRCode from 'qrcode'
import type { FastifyPluginAsync } from '@meridian/service-sdk/server'
import { getRuntime } from './runtime.js'

// What the window shows: the connection state and, while the phone has to scan, the QR code as an SVG.
export const whatsappRoutes: FastifyPluginAsync = async (app) => {
  app.get('/pairing', async () => {
    const { client, process: bridge } = getRuntime()
    if (bridge.problem) return { state: 'down', message: bridge.problem }
    try {
      const { state, qr, phone } = await client.status()
      return { state, phone: phone || undefined, qrSvg: state === 'pairing' && qr ? await QRCode.toString(qr, { type: 'svg', margin: 1 }) : undefined }
    } catch {
      return { state: 'down', message: 'the bridge is starting' }
    }
  })
}
