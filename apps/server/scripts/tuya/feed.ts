import { getToken, tuya } from '../../src/tuya/tuya-client.js'
import { requireArg } from './script-args.js'

interface ShadowProperty {
  code: string
  value: unknown
  time: number
}

const SETTLE_MS = 8000
const REPORT_CODES = 'feed_report,manual_feed_report,history_data,feed_block_status,food_storage_status'

const id = requireArg(0, 'device-id')
const portions = Number(process.argv[3] ?? 1)
const token = await getToken()

const readReports = async () => {
  const res = await tuya<{ properties: ShadowProperty[] }>(
    'GET',
    `/v2.0/cloud/thing/${id}/shadow/properties?codes=${REPORT_CODES}`,
    undefined,
    token,
  )
  return Object.fromEntries(
    (res.result?.properties ?? []).map((p) => [p.code, `${String(p.value)} @${new Date(p.time).toISOString()}`]),
  )
}

console.log('before', await readReports())
// The shadow API takes `properties` as a JSON string, not an object.
const res = await tuya('POST', `/v2.0/cloud/thing/${id}/shadow/properties/issue`, {
  properties: JSON.stringify({ feed_publish: portions }),
}, token)
console.log('issue', JSON.stringify(res))
await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
console.log('after', await readReports())
