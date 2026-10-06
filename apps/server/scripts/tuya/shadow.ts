import { getToken, tuya } from '../../src/integrations/tuya/tuya-client.js'
import { requireArg } from './script-args.js'

const MAX_OUTPUT = 3500

const id = requireArg(0, 'device-id')
const token = await getToken()
const paths = [`/v2.0/cloud/thing/${id}/shadow/properties`, `/v2.0/cloud/thing/${id}/model`, `/v1.0/devices/${id}`]

// The device details response includes local_key, ip and uid: never paste this output anywhere.
for (const path of paths) {
  const res = await tuya('GET', path, undefined, token)
  const out = JSON.stringify(res.success ? res.result : res)
  console.log('==', path.replace(id, '<id>'), '\n', out.length > MAX_OUTPUT ? `${out.slice(0, MAX_OUTPUT)}…[truncated]` : out)
}
