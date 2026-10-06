import { getToken, tuya } from '../server/tuya-client.js'
import { requireArg } from './script-args.js'

type StreamType = 'RTSP' | 'HLS' | 'FLV' | 'RTMP'

const id = requireArg(0, 'device-id')
const type = (process.argv[3] ?? 'HLS') as StreamType
const token = await getToken()
const res = await tuya<{ url: string }>('POST', `/v1.0/devices/${id}/stream/actions/allocate`, { type }, token)

console.log(JSON.stringify({ success: res.success, code: res.code, msg: res.msg, hasUrl: Boolean(res.result?.url) }, null, 2))
// The stream URL grants access to the camera feed, so it is only printed on explicit request.
if (res.result?.url && process.env.SHOW_URL) console.log(res.result.url)
