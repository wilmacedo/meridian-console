import { appendFileSync, chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface AuditEntry {
  device: string
  tool: string
  // Host and path only: never a query string, page text or typed text.
  target?: string
  outcome: 'ok' | 'refused' | 'declined' | 'error'
}

// The target is cut at the query or fragment here, so no caller can leak one into the log by mistake.
const stripQuery = (target: string): string => target.replace(/[?#].*$/, '')

export class AuditLog {
  constructor(
    private readonly file: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    mkdirSync(dirname(file), { recursive: true })
    if (!existsSync(file)) writeFileSync(file, '', { mode: 0o600 })
    chmodSync(file, 0o600)
  }

  record(entry: AuditEntry): void {
    const fields = [this.now().toISOString(), entry.device, entry.tool, entry.target ? stripQuery(entry.target) : '-', entry.outcome]
    appendFileSync(this.file, `${fields.join(' ')}\n`)
  }
}
