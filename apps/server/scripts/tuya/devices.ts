import { getToken, tuya } from '../../src/tuya/tuya-client.js'

interface Device {
  id: string
  name: string
  category: string
  product_name: string
  online: boolean
  sub: boolean
}

const token = await getToken()
const res = await tuya<{ devices: Device[] }>('GET', '/v1.0/iot-01/associated-users/devices', undefined, token)
if (!res.success || !res.result) throw new Error(`code=${res.code} msg=${res.msg}`)

for (const d of res.result.devices) {
  console.log(
    [d.id, d.name, d.category, d.product_name, d.online ? 'online' : 'offline', d.sub ? 'sub (zigbee/gateway)' : 'direct'].join(' | '),
  )
}
