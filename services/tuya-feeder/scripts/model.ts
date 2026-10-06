import { getToken, tuya } from '../server/tuya-client.js'
import { requireArg } from './script-args.js'

interface ModelProperty {
  abilityId: number
  code: string
  accessMode: string
  typeSpec: unknown
  name: string
  description?: string
}

interface ThingModel {
  services: { properties: ModelProperty[] }[]
}

const FIRST_FEEDER_DP = 232

const id = requireArg(0, 'device-id')
const token = await getToken()
const res = await tuya<{ model: string }>('GET', `/v2.0/cloud/thing/${id}/model`, undefined, token)
if (!res.success || !res.result) throw new Error(`code=${res.code} msg=${res.msg}`)

// The model is a JSON document serialized inside a string field.
const model = JSON.parse(res.result.model) as ThingModel
for (const service of model.services) {
  for (const p of service.properties) {
    if (p.abilityId < FIRST_FEEDER_DP) continue
    console.log(p.abilityId, p.code, p.accessMode, JSON.stringify(p.typeSpec), '|', p.name, '|', (p.description ?? '').replace(/\n/g, ' '))
  }
}
