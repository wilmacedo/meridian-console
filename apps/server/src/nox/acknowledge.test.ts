import { describe, expect, it } from 'vitest'
import { isSlowTool, pickAck } from './acknowledge.js'

describe('isSlowTool', () => {
  it('counts what reaches a machine or a service, and not what is local and instant', () => {
    for (const name of ['Bash', 'WebSearch', 'WebFetch', 'call_service_action', 'list_containers', 'add_service', 'start_task', 'service_tuya-feeder_feeder-status']) expect(isSlowTool(name)).toBe(true)
    for (const name of ['open_window', 'set_theme', 'pin_widget', 'compose_doc', 'get_status', 'get_telemetry', 'query_events']) expect(isSlowTool(name)).toBe(false)
  })
})

describe('pickAck', () => {
  it('picks any of the phrases, and always a short sentence', () => {
    const seen = new Set([0, 0.25, 0.5, 0.75, 0.999].map((r) => pickAck(() => r)))
    expect(seen.size).toBeGreaterThan(1)
    for (const ack of seen) expect(ack.length).toBeLessThan(40)
  })
})
