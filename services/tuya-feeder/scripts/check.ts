import { getToken, tuya } from '../server/tuya-client.js'

interface DeviceList {
  devices?: unknown[]
}

const token = await getToken()
console.log('token OK')
const res = await tuya<DeviceList>('GET', '/v1.0/iot-01/associated-users/devices', undefined, token)
console.log(
  'devices call:',
  res.success ? `OK, ${res.result?.devices?.length ?? 0} device(s)` : `failed code=${res.code} msg=${res.msg}`,
)
