import { defineServerService, type FastifyPluginAsync, type ServiceStatus } from '@meridian/service-sdk/server'
import { cameraRoutes } from './camera.js'
import { feederRoutes, readStatus, type FeederStatus } from './feeder.js'

// The dashboard polls this, and every read costs Tuya API quota, so share one reading between polls.
const STATUS_CACHE_MS = 30_000

let cached: { at: number; value: FeederStatus } | undefined

async function status(): Promise<ServiceStatus> {
  const deviceId = process.env.TUYA_FEEDER_DEVICE_ID
  if (!deviceId) return { state: 'warn', message: 'TUYA_FEEDER_DEVICE_ID is not set' }

  if (!cached || Date.now() - cached.at > STATUS_CACHE_MS) {
    cached = { at: Date.now(), value: await readStatus(deviceId) }
  }
  const { lastFeed, battery, blocked } = cached.value

  const problem = blocked
    ? 'dispenser clogged'
    : lastFeed?.portions === 0
      ? 'last feeding failed'
      : battery && battery.value !== 'high'
        ? `battery ${battery.value}`
        : undefined

  return {
    state: problem ? 'warn' : 'ok',
    message: problem,
    facts: [
      { label: 'LAST FEED', value: lastFeed ? `${lastFeed.portions} · ${lastFeed.source}` : '—' },
      { label: 'BATTERY', value: battery?.value ?? '—' },
    ],
  }
}

const routes: FastifyPluginAsync = async (app) => {
  await app.register(feederRoutes)
  await app.register(cameraRoutes)
}

export default defineServerService({
  manifest: {
    id: 'tuya-feeder',
    name: 'pet-feeder',
    kind: 'home-device',
    tag: 'TUYA',
    description: 'Automatic pet feeder with a camera, through the Tuya Cloud API',
  },
  routes,
  status,
})
