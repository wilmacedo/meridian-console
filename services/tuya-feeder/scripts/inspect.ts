import { getToken, tuya } from '../server/tuya-client.js'
import { requireArg } from './script-args.js'

const id = requireArg(0, 'device-id')
const token = await getToken()
const spec = await tuya('GET', `/v1.0/devices/${id}/specifications`, undefined, token)
const status = await tuya('GET', `/v1.0/devices/${id}/status`, undefined, token)
console.log('SPEC', JSON.stringify(spec.success ? spec.result : spec, null, 1))
console.log('STATUS', JSON.stringify(status.success ? status.result : status))
