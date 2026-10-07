import { request } from 'node:http'
import type { ContainerInfo } from '@meridian/service-sdk'

const SOCKET = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock'

function get<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: SOCKET, path, timeout: 8000 }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        if ((res.statusCode ?? 500) >= 400) reject(new Error(`docker ${path} responded ${res.statusCode}`))
        else resolve(JSON.parse(body) as T)
      })
    })
    req.on('timeout', () => req.destroy(new Error(`docker ${path} timed out`)))
    req.on('error', reject)
    req.end()
  })
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
