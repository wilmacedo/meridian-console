import { readFile, readdir } from 'node:fs/promises'
import type { FastifyBaseLogger } from 'fastify'
import type { ContainerInfo, TelemetrySample } from '@meridian/service-sdk'
import { listContainers } from './docker.js'
import { cpuPercent, hottest, parseCpuTimes, parseMemInfo, parseNetBytes, type CpuTimes } from './proc-parsers.js'

const SAMPLE_MS = 1000
const CONTAINERS_MS = 5000
// What the design's sparklines show.
const HISTORY = 48
const THERMAL_DIR = '/sys/class/thermal'

async function readTemp(): Promise<number | null> {
  try {
    const zones = (await readdir(THERMAL_DIR)).filter((z) => z.startsWith('thermal_zone'))
    const values = await Promise.all(zones.map((z) => readFile(`${THERMAL_DIR}/${z}/temp`, 'utf8').then(Number, () => Number.NaN)))
    return hottest(values)
  } catch {
    return null
  }
}

type Listener = (sample: TelemetrySample, containers: ContainerInfo[]) => void

// Host load from /proc and /sys, once a second, plus the Docker containers every few seconds.
export class HostTelemetry {
  memTotalGb = 0
  private history: TelemetrySample[] = []
  private containerList: ContainerInfo[] = []
  private listeners = new Set<Listener>()
  private prevCpu: CpuTimes | undefined
  private prevNet: { bytes: number; at: number } | undefined
  private dockerWarned = false

  constructor(private log: FastifyBaseLogger) {}

  samples(): TelemetrySample[] {
    return [...this.history]
  }

  containers(): ContainerInfo[] {
    return this.containerList
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async start(): Promise<void> {
    await this.sample()
    await this.refreshContainers()
    setInterval(() => void this.sample(), SAMPLE_MS).unref()
    setInterval(() => void this.refreshContainers(), CONTAINERS_MS).unref()
  }

  private async sample(): Promise<void> {
    try {
      const [stat, meminfo, netdev, temp] = await Promise.all([readFile('/proc/stat', 'utf8'), readFile('/proc/meminfo', 'utf8'), readFile('/proc/net/dev', 'utf8'), readTemp()])
      const cpuNow = parseCpuTimes(stat)
      const cpu = this.prevCpu ? cpuPercent(this.prevCpu, cpuNow) : 0
      this.prevCpu = cpuNow

      const { usedGb, totalGb } = parseMemInfo(meminfo)
      this.memTotalGb = totalGb

      const now = Date.now()
      const bytes = parseNetBytes(netdev)
      const net = this.prevNet ? Math.max(0, bytes - this.prevNet.bytes) / 1e6 / ((now - this.prevNet.at) / 1000) : 0
      this.prevNet = { bytes, at: now }

      const sample: TelemetrySample = { cpu, mem: usedGb, temp, net }
      this.history.push(sample)
      if (this.history.length > HISTORY) this.history.shift()
      for (const listener of this.listeners) listener(sample, this.containerList)
    } catch (err) {
      this.log.error(err, 'host telemetry sample failed')
    }
  }

  private async refreshContainers(): Promise<void> {
    try {
      this.containerList = await listContainers()
      this.dockerWarned = false
    } catch (err) {
      this.containerList = []
      if (!this.dockerWarned) this.log.warn(err, 'docker is not reachable, container telemetry is off')
      this.dockerWarned = true
    }
  }
}
