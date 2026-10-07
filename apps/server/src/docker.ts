import { request } from 'node:http'
import type { ContainerInfo } from '@meridian/service-sdk'

const SOCKET = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock'

interface Reply {
  status: number
  body: Buffer
}

function call(method: 'GET' | 'POST', path: string, timeout = 8000): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: SOCKET, path, method, timeout }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: Buffer.concat(chunks) }))
    })
    req.on('timeout', () => req.destroy(new Error(`docker ${path} timed out`)))
    req.on('error', reject)
    req.end()
  })
}

async function get<T>(path: string): Promise<T> {
  const { status, body } = await call('GET', path)
  if (status >= 400) throw new Error(`docker ${path} responded ${status}`)
  return JSON.parse(body.toString('utf8')) as T
}

interface RawStats {
  cpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage?: number }
  precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage?: number }
  memory_stats: { usage?: number; stats?: Record<string, number> }
}

// CPU as a share of the whole host (what the design's "% of host" means) and memory in MB, without
// the page cache the kernel can reclaim.
export function containerUsage(raw: RawStats): { cpu: number; mem: number } {
  const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage
  const systemDelta = (raw.cpu_stats.system_cpu_usage ?? 0) - (raw.precpu_stats.system_cpu_usage ?? 0)
  const cpu = systemDelta > 0 ? Math.max(0, (cpuDelta / systemDelta) * 100) : 0
  const cache = raw.memory_stats.stats?.inactive_file ?? raw.memory_stats.stats?.cache ?? 0
  const mem = Math.max(0, (raw.memory_stats.usage ?? 0) - cache) / 1024 / 1024
  return { cpu, mem }
}

interface RawContainer {
  Id: string
  Names: string[]
  State: string
}

interface RawInspect {
  State: { StartedAt: string }
}

// Running containers with their usage. Throws when the Docker socket isn't reachable.
export async function listContainers(): Promise<ContainerInfo[]> {
  const running = await get<RawContainer[]>('/containers/json')
  const infos = await Promise.all(
    running.map(async (c): Promise<ContainerInfo> => {
      const [inspect, stats] = await Promise.all([get<RawInspect>(`/containers/${c.Id}/json`), get<RawStats>(`/containers/${c.Id}/stats?stream=false`)])
      const { cpu, mem } = containerUsage(stats)
      const uptimeSec = Math.max(0, Math.round((Date.now() - new Date(inspect.State.StartedAt).getTime()) / 1000))
      return { name: c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12), state: c.State, cpu, mem, uptimeSec }
    }),
  )
  return infos.sort((a, b) => a.name.localeCompare(b.name))
}

// Container names reach the Docker API as part of a path, so only what Docker itself allows gets through.
export const CONTAINER_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/

export interface ContainerSummary {
  name: string
  image: string
  state: string
  status: string
  ports: string[]
}

interface RawListed {
  Names: string[]
  Image: string
  State: string
  Status: string
  Ports: { PublicPort?: number; PrivatePort: number; Type: string }[]
}

// Every container, running or not: what the owner may want NOX to put under Meridian.
export async function allContainers(): Promise<ContainerSummary[]> {
  const raw = await get<RawListed[]>('/containers/json?all=1')
  return raw
    .map((c) => ({
      name: c.Names[0]?.replace(/^\//, '') ?? '?',
      image: c.Image,
      state: c.State,
      status: c.Status,
      ports: [...new Set(c.Ports.filter((p) => p.PublicPort).map((p) => `${p.PublicPort}->${p.PrivatePort}/${p.Type}`))],
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface ContainerDetails {
  state: string
  // Docker's own health check verdict, when the image defines one.
  health?: string
  startedAt: string
  image: string
}

interface RawDetails {
  State: { Status: string; StartedAt: string; Health?: { Status: string } }
  Config: { Image: string; Tty: boolean }
}

async function details(name: string): Promise<(ContainerDetails & { tty: boolean }) | undefined> {
  const { status, body } = await call('GET', `/containers/${name}/json`)
  if (status === 404) return undefined
  if (status >= 400) throw new Error(`docker inspect responded ${status}`)
  const raw = JSON.parse(body.toString('utf8')) as RawDetails
  return { state: raw.State.Status, health: raw.State.Health?.Status, startedAt: raw.State.StartedAt, image: raw.Config.Image, tty: raw.Config.Tty }
}

// Without a TTY Docker multiplexes stdout and stderr into frames: a 8-byte header (stream, 0, 0, 0,
// big-endian length) and the payload. With a TTY the log is plain text.
export function demuxLogs(buf: Buffer, tty: boolean): string {
  if (tty) return buf.toString('utf8')
  let out = ''
  let at = 0
  while (at + 8 <= buf.length) {
    const size = buf.readUInt32BE(at + 4)
    out += buf.subarray(at + 8, at + 8 + size).toString('utf8')
    at += 8 + size
  }
  return out
}

// What the registry needs of Docker for a managed service; tests stand in for it.
export interface DockerApi {
  inspect: (name: string) => Promise<ContainerDetails | undefined>
  logs: (name: string, lines: number) => Promise<string>
  control: (name: string, verb: 'start' | 'stop' | 'restart') => Promise<void>
}

export const docker: DockerApi = {
  async inspect(name) {
    const d = await details(name)
    return d && { state: d.state, health: d.health, startedAt: d.startedAt, image: d.image }
  },
  async logs(name, lines) {
    const d = await details(name)
    if (!d) throw new Error(`no container "${name}"`)
    const { status, body } = await call('GET', `/containers/${name}/logs?stdout=1&stderr=1&tail=${lines}`)
    if (status >= 400) throw new Error(`docker logs responded ${status}`)
    return demuxLogs(body, d.tty)
  },
  async control(name, verb) {
    // Stopping waits for the container to exit, which can take its grace period.
    const { status } = await call('POST', `/containers/${name}/${verb}?t=10`, 30_000)
    // 304: it was already in the state asked for.
    if (status >= 400) throw new Error(`docker ${verb} responded ${status}`)
  },
}
