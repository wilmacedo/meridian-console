import { spawnSync } from 'node:child_process'
import { rmSync, statSync } from 'node:fs'
import { getToken, tuya } from '../../src/tuya/tuya-client.js'
import { requireArg } from './script-args.js'

const CAPTURE_SECONDS = 8
const TIMEOUT_MS = 20_000
const IO_TIMEOUT_US = 10_000_000

const id = requireArg(0, 'device-id')
const out = process.argv[3] ?? 'snap.jpg'
const token = await getToken()
const res = await tuya<{ url: string }>('POST', `/v1.0/devices/${id}/stream/actions/allocate`, { type: 'RTSP' }, token)
if (!res.result?.url) {
  console.error('no stream url', res.code, res.msg)
  process.exit(1)
}

// HLS only ever yielded the loading placeholder, so RTSP it is; -update 1 keeps the last frame. ffmpeg sometimes
// hangs closing the RTSP session after writing the frame, hence the SIGKILL, and success is judged by the file rather than the exit code.
rmSync(out, { force: true })
const ffmpeg = spawnSync(
  'ffmpeg',
  ['-y', '-loglevel', 'error', '-rtsp_transport', 'tcp', '-timeout', String(IO_TIMEOUT_US), '-i', res.result.url, '-t', String(CAPTURE_SECONDS), '-update', '1', out],
  { encoding: 'utf8', timeout: TIMEOUT_MS, killSignal: 'SIGKILL' },
)
const captured = statSync(out, { throwIfNoEntry: false })?.size ?? 0
console.log(captured > 0 ? `ok: ${out}` : `failed: ${ffmpeg.stderr.replace(/\S+:\/\/\S+/g, '<url>')}`)
