import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AuditLog } from './audit.js'

const make = () => {
  const file = join(mkdtempSync(join(tmpdir(), 'devices-audit-')), 'sub', 'audit.log')
  return { file, log: new AuditLog(file, () => new Date('2026-10-11T12:00:00Z')) }
}

describe('AuditLog', () => {
  it('is readable by its owner only', () => {
    const { file } = make()
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  it('writes one line per call with host and path, never the query or fragment', () => {
    const { file, log } = make()
    log.record({ device: 'personal', tool: 'browser_open', target: 'example.com/a/b?token=secret#frag', outcome: 'ok' })
    log.record({ device: 'personal', tool: 'browser_click', outcome: 'declined' })
    expect(readFileSync(file, 'utf8')).toBe('2026-10-11T12:00:00.000Z personal browser_open example.com/a/b ok\n2026-10-11T12:00:00.000Z personal browser_click - declined\n')
  })
})
