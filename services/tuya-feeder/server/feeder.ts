import type { FastifyPluginAsync } from '@meridian/service-sdk/server'
import { getToken, tuya } from './tuya-client.js'

const MIN_PORTIONS = 1
const MAX_PORTIONS = 99
// The device takes ~4s to report back; this also stops a double click or two clients from dispensing twice.
const FEED_COOLDOWN_MS = 10_000

const STATUS_CODES = [
  'feed_report',
  'manual_feed_report',
  'auto_feed_report',
  'battery_status',
  'food_storage_status',
  'feed_block_status',
].join(',')

interface ShadowProperty {
  code: string
  value: unknown
  time: number
}

interface Reading<T> {
  value: T
  at: string
}

export interface FeederStatus {
  // portions 0 means the device reported a failed feeding
  lastFeed: { portions: number; source: 'manual' | 'auto'; at: string } | null
  battery: Reading<string> | null
  foodStorage: Reading<string> | null
  blocked: boolean
}

let lastFeedIssuedAt = 0

const toReading = <T>(property: ShadowProperty | undefined): Reading<T> | null =>
  property ? { value: property.value as T, at: new Date(property.time).toISOString() } : null

export async function readStatus(deviceId: string): Promise<FeederStatus> {
  const res = await tuya<{ properties: ShadowProperty[] }>(
    'GET',
    `/v2.0/cloud/thing/${deviceId}/shadow/properties?codes=${STATUS_CODES}`,
    undefined,
    await getToken(),
  )
  if (!res.success || !res.result) throw new Error(`shadow read failed: code=${res.code} msg=${res.msg}`)

  const byCode = new Map(res.result.properties.map((p) => [p.code, p]))
  const report = byCode.get('feed_report')
  const manual = byCode.get('manual_feed_report')
  const auto = byCode.get('auto_feed_report')

  const lastFeed = report
    ? {
        portions: Number(report.value),
        source:
          Math.abs((manual?.time ?? 0) - report.time) <= Math.abs((auto?.time ?? 0) - report.time)
            ? ('manual' as const)
            : ('auto' as const),
        at: new Date(report.time).toISOString(),
      }
    : null

  // The device keeps the last clog flag until it is cleared; one older than the last feeding is stale,
  // since a clogged feeder cannot have served food afterwards.
  const block = byCode.get('feed_block_status')
  const blocked = Boolean(block?.value) && (!report || block!.time > report.time)

  return {
    lastFeed,
    battery: toReading<string>(byCode.get('battery_status')),
    foodStorage: toReading<string>(byCode.get('food_storage_status')),
    blocked,
  }
}

export const feederRoutes: FastifyPluginAsync = async (app) => {
  app.get('/status', async (_request, reply) => {
    const deviceId = process.env.TUYA_FEEDER_DEVICE_ID
    if (!deviceId) return reply.code(503).send({ error: 'TUYA_FEEDER_DEVICE_ID is not set' })

    try {
      return await readStatus(deviceId)
    } catch (err) {
      app.log.error(err, 'feeder status read failed')
      return reply.code(502).send({ error: 'feeder unavailable' })
    }
  })

  app.post<{ Body: { portions: number } }>(
    '/feed',
    {
      schema: {
        body: {
          type: 'object',
          required: ['portions'],
          properties: { portions: { type: 'integer', minimum: MIN_PORTIONS, maximum: MAX_PORTIONS } },
        },
      },
    },
    async (request, reply) => {
      const deviceId = process.env.TUYA_FEEDER_DEVICE_ID
      if (!deviceId) return reply.code(503).send({ error: 'TUYA_FEEDER_DEVICE_ID is not set' })

      if (Date.now() - lastFeedIssuedAt < FEED_COOLDOWN_MS) {
        return reply.code(429).send({ error: 'a feeding was just issued, wait a few seconds' })
      }
      lastFeedIssuedAt = Date.now()

      // The shadow API takes `properties` as a JSON string, not an object.
      const res = await tuya('POST', `/v2.0/cloud/thing/${deviceId}/shadow/properties/issue`, {
        properties: JSON.stringify({ feed_publish: request.body.portions }),
      }, await getToken())
      if (!res.success) {
        lastFeedIssuedAt = 0
        app.log.error({ code: res.code, msg: res.msg }, 'feeder feed command failed')
        return reply.code(502).send({ error: 'feeder rejected the command' })
      }

      return { issued: request.body.portions, at: new Date().toISOString() }
    },
  )
}
